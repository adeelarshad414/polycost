/*
  The browser session (audit H-05 part 2).

  The session token lives in an HttpOnly cookie that the API sets at sign-in, so
  no script on this page - ours or an injected one - can read it. The browser
  attaches it to API calls by itself (`credentials: 'include'`).

  What the page does hold:
  - COOKIE_SESSION, a fixed, non-secret marker the workspace keeps where it
    used to keep the token, meaning "signed in, the cookie carries it". The
    client sends no Authorization header for it.
  - The CSRF token, in memory only. The API binds it to the session and wants
    it on every cookie-authenticated change; sign-in and /auth/me return it.
    A reload loses it, and the next /auth/me hands it back.
*/

import { AUTH_SESSION_STORAGE_KEY } from './app-catalogs';

export const COOKIE_SESSION = 'cookie-session';

/** This browser believes it is signed in (the non-secret marker is stored). */
export function hasCookieSessionHint(): boolean {
  try {
    return window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) === COOKIE_SESSION;
  } catch {
    return false;
  }
}

let csrfToken: string | undefined;

export function rememberCsrfToken(token: string | undefined): void {
  csrfToken = token || undefined;
}

export function currentCsrfToken(): string | undefined {
  return csrfToken;
}

export function forgetCsrfToken(): void {
  csrfToken = undefined;
}
