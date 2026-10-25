/*
  The signed-in session, for core API calls (ADR-0001 §3.7).

  Comparisons, workloads, budgets, alerts and share links are team-owned when
  created with a session, and only team members can read them afterwards. So
  every core call carries the session when there is one. The token is read from
  storage at call time rather than held in component state: the workspace panel
  that signs people in is not always mounted, and storage is what it writes.

  A token that has already expired is not sent. The API answers a bad token with
  401 instead of treating the caller as anonymous, so sending a known-dead
  token would only turn every comparison into an error.
*/
import { AUTH_SESSION_EXPIRES_AT_STORAGE_KEY, AUTH_SESSION_STORAGE_KEY } from './app-catalogs';

export function currentSessionToken(): string | undefined {
  try {
    const token = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? '';
    if (!token) return undefined;
    const expiresAt = Date.parse(
      window.localStorage.getItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY) ?? '',
    );
    return Number.isFinite(expiresAt) && expiresAt <= Date.now() ? undefined : token;
  } catch {
    // Storage blocked (private window): no persisted session to send.
    return undefined;
  }
}
