// Writes the nginx security headers for the built SPA (audit H-05, part 1).
//
// The Content-Security-Policy is derived from the build output rather than
// written by hand: every inline <script> in dist/index.html (today, the
// pre-paint theme script) is allowed by its SHA-256 hash, so editing that
// script can never silently break the policy or tempt anyone into
// 'unsafe-inline'. The API origin comes from VITE_API_BASE_URL, which compose
// sets to an absolute URL on another port.
//
// Usage: node write-security-headers.mjs <dist/index.html> <output.conf>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim() === '') continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`);
  }
  return hashes;
}

export function apiOrigin(apiBaseUrl) {
  if (!apiBaseUrl || !/^https?:\/\//i.test(apiBaseUrl)) return undefined;
  return new URL(apiBaseUrl).origin;
}

export function contentSecurityPolicy({ scriptHashes, connectOrigin }) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    // React applies inline styles through CSSOM, which CSP does not govern;
    // there are no style attributes or <style> blocks in the shell.
    "style-src 'self'",
    // Vite inlines small font subsets into the CSS as data: URIs.
    "font-src 'self' data:",
    "img-src 'self' data:",
    `connect-src 'self'${connectOrigin ? ` ${connectOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function nginxHeaders(csp) {
  // `always` so error responses carry the headers too.
  return [
    '# Generated at image build by apps/web/scripts/write-security-headers.mjs.',
    `add_header Content-Security-Policy "${csp}" always;`,
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header X-Frame-Options "DENY" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;',
    'add_header Cross-Origin-Opener-Policy "same-origin" always;',
    // Browsers ignore HSTS over plain HTTP, so this only takes effect behind the
    // TLS-terminating ingress. No includeSubDomains: the operator's other hosts
    // are not ours to pin.
    'add_header Strict-Transport-Security "max-age=31536000" always;',
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [indexPath, outputPath] = process.argv.slice(2);
  if (!indexPath || !outputPath) {
    console.error('Usage: write-security-headers.mjs <dist/index.html> <output.conf>');
    process.exit(2);
  }
  const html = readFileSync(indexPath, 'utf8');
  const csp = contentSecurityPolicy({
    scriptHashes: inlineScriptHashes(html),
    connectOrigin: apiOrigin(process.env.VITE_API_BASE_URL),
  });
  writeFileSync(outputPath, nginxHeaders(csp));
  console.log(`Wrote ${outputPath}\n${csp}`);
}
