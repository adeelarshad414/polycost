import { isValidEmailAddress, MAX_EMAIL_LENGTH } from './email-address.js';

describe('isValidEmailAddress', () => {
  it.each(['a@b.co', 'first.last@sub.example.com', 'x+tag@d.io'])('accepts %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(true);
  });

  it.each(['a@b', 'a@.com', 'a@b..com', 'a b@c.d', '@b.co', 'a@b.co.'])('rejects %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(false);
  });

  it('rejects addresses longer than the RFC 5321 limit', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH);
    expect(isValidEmailAddress(`${local}@example.com`)).toBe(false);
  });

  it('stays linear on the backtracking input that used to stall the event loop', () => {
    // Bypass the length cap to exercise the pattern itself on a hostile string.
    const hostile = `a@${'.'.repeat(200_000)}@`;
    const started = performance.now();
    expect(/^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/.test(hostile)).toBe(false);
    expect(isValidEmailAddress(hostile)).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
