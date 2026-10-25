import type { ResourceOwnership } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Expires in 12 days", "Expires within a day" (ADR-0001 §3.7). Whole days left, rounded down. */
export function expiryLabel(expiresAt: string | null, now = Date.now()): string {
  if (!expiresAt) {
    return 'Expiry set at the next retention sweep';
  }
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining)) {
    return 'Expiry unknown';
  }
  if (remaining <= 0) return 'Expired';
  const days = Math.floor(remaining / DAY_MS);
  if (days === 0) return 'Expires within a day';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

/** One line on what this browser can do with the comparison. */
export function accessSummary(ownership: ResourceOwnership): string {
  if (ownership.owner === 'team') {
    return ownership.canChange
      ? 'Visible to your team only.'
      : 'View only: viewers can read team comparisons but not change them.';
  }
  return ownership.canChange
    ? 'Anyone with the link can view it. Only this browser holds the edit key.'
    : 'View only: the edit key is in the browser that created this comparison.';
}
