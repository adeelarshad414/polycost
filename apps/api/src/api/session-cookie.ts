import { createHash, timingSafeEqual } from 'node:crypto';

/*
  Browser sessions (audit H-05 part 2).

  The web app no longer holds the session token. Signing in with the header
  `X-PolyCost-Session: cookie` sets it as an HttpOnly cookie instead, so a
  script injected into the page cannot read it. API clients keep sending
  `Authorization: Bearer` and never see a cookie.

  A cookie is sent by the browser on its own, so a cookie-authenticated request
  that changes something must also prove it came from our page: the
  `X-CSRF-Token` header must equal `csrfTokenFor(session)`. The page learns that
  value from the sign-in and `/auth/me` JSON, which another origin cannot read
  (CORS), and an attacker cannot compute it without the HttpOnly session. No
  second cookie, so it works when the web app and API are on different hosts.
  SameSite=Lax already keeps the cookie off cross-site POSTs; the token covers
  same-site attackers and older browsers.
*/

export const SESSION_COOKIE = 'polycost_session';
export const CSRF_HEADER = 'x-csrf-token';
export const SESSION_MODE_HEADER = 'x-polycost-session';

// Every API route lives under /api; nothing else needs the cookie.
const COOKIE_PATH = '/api';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type Headers = Record<string, unknown> | undefined;

function header(headers: Headers, name: string): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** One cookie's value from the request, or undefined. */
export function readCookie(headers: Headers, name: string): string | undefined {
  const raw = header(headers, 'cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return value ? decodeURIComponent(value) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The browser asked for a cookie session instead of a token in the body. */
export function wantsCookieSession(headers: Headers): boolean {
  return header(headers, SESSION_MODE_HEADER)?.toLowerCase() === 'cookie';
}

export function sessionCookie(token: string, expiresAt: string, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    `Path=${COOKIE_PATH}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/** Bound to the session: only someone holding the session can compute it. */
export function csrfTokenFor(sessionToken: string): string {
  return createHash('sha256').update(`polycost-csrf:${sessionToken}`).digest('hex');
}

export function isUnsafeMethod(method: string | undefined): boolean {
  return !SAFE_METHODS.has((method ?? 'GET').toUpperCase());
}

export function csrfHeaderMatches(headers: Headers, sessionToken: string): boolean {
  const sent = header(headers, CSRF_HEADER);
  if (!sent) return false;
  const expected = Buffer.from(csrfTokenFor(sessionToken));
  const candidate = Buffer.from(sent);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
