import { domainToASCII } from 'node:url';

/*
  Email-domain ownership for SCIM (audit H-01).

  A team proves it controls acme.com by publishing
    _polycost-verification.acme.com  TXT  "polycost-verification=<token>"
  Only then may its SCIM token create or link @acme.com accounts.
*/

export const VERIFICATION_RECORD_PREFIX = '_polycost-verification';
export const VERIFICATION_VALUE_PREFIX = 'polycost-verification=';

// Shared mailbox providers: nobody can own these for a team, and a claim on
// one would let a team provision strangers' addresses.
const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'qq.com',
  '163.com',
  'example.com',
  'example.org',
  'example.net',
]);

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type DomainProblem = 'invalid' | 'consumer';

/**
 * "  @Acme.COM. " -> "acme.com"; internationalised names become punycode so
 * one domain has one spelling. Returns the problem instead when it cannot be
 * owned by a team.
 */
export function normalizeDomain(
  input: string,
  options: { allowReserved?: boolean } = {},
): { domain: string } | { problem: DomainProblem } {
  const trimmed = input.trim().replace(/^@/, '').replace(/\.$/, '').toLowerCase();
  const ascii = trimmed ? domainToASCII(trimmed) : '';
  if (!ascii || ascii.length > 253 || !DOMAIN_PATTERN.test(ascii) || /^[\d.]+$/.test(ascii)) {
    return { problem: 'invalid' };
  }
  if (CONSUMER_DOMAINS.has(ascii) && !(options.allowReserved && ascii.startsWith('example.'))) {
    return { problem: 'consumer' };
  }
  return { domain: ascii };
}

/** The domain part of an email address, normalised the same way. */
export function emailDomain(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at < 1) return undefined;
  const normalized = normalizeDomain(email.slice(at + 1), { allowReserved: true });
  return 'domain' in normalized ? normalized.domain : undefined;
}

export function verificationRecordName(domain: string): string {
  return `${VERIFICATION_RECORD_PREFIX}.${domain}`;
}

export function verificationRecordValue(token: string): string {
  return `${VERIFICATION_VALUE_PREFIX}${token}`;
}

/** resolveTxt returns each record as string chunks; join them before comparing. */
export function txtRecordsContain(records: string[][], expected: string): boolean {
  return records.some((chunks) => chunks.join('').trim() === expected);
}
