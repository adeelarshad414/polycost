/**
 * Email address check shared by local auth and SCIM provisioning (audit H-03).
 *
 * The domain is dot-separated labels with no dots inside a label, so the pattern
 * has no overlapping quantifiers and runs in linear time. The previous
 * /^[^@\s]+@[^@\s]+\.[^@\s]+$/ backtracked quadratically: "a@" followed by
 * 32,000 dots took ~1.4 s, on unauthenticated routes that accept 8 MB bodies.
 * The RFC 5321 length cap is checked first so the regex never sees long input.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

export const MAX_EMAIL_LENGTH = 254;

export function isValidEmailAddress(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}
