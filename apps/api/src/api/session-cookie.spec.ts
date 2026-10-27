import { describe, it, expect, jest } from '@jest/globals';
import { registerDeadSessionCookieClearing } from '../bootstrap.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { RequestWithAuth } from './auth.types.js';
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  csrfHeaderMatches,
  csrfTokenFor,
  isUnsafeMethod,
  readCookie,
  sessionCookie,
  wantsCookieSession,
} from './session-cookie.js';

// Audit H-05 part 2: the browser session lives in an HttpOnly cookie, and a
// cookie-authenticated change must carry the session-bound CSRF token.

const IDENTITY = {
  accountId: 'acct',
  email: 'a@example.com',
  teamId: 'team',
  sessionId: 'sess',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('session cookie helpers', () => {
  it('reads one cookie and ignores the rest, including malformed values', () => {
    const headers = { cookie: `theme=dark; ${SESSION_COOKIE}=abc%2Fdef; other=1` };
    expect(readCookie(headers, SESSION_COOKIE)).toBe('abc/def');
    expect(readCookie({ cookie: `${SESSION_COOKIE}=%E0%A4%A` }, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie({ cookie: 'novalue; x' }, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie({}, SESSION_COOKIE)).toBeUndefined();
  });

  it('issues an HttpOnly, SameSite=Lax cookie scoped to /api, Secure unless turned off', () => {
    const inOneHour = new Date(Date.now() + 3_600_000).toISOString();
    const secure = sessionCookie('tok', inOneHour, true);
    expect(secure).toMatch(
      /^polycost_session=tok; Path=\/api; Max-Age=3[56]\d\d; HttpOnly; SameSite=Lax; Secure$/,
    );
    expect(sessionCookie('tok', inOneHour, false)).not.toContain('Secure');
    expect(clearedSessionCookie(true)).toBe(
      'polycost_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
    );
  });

  it('accepts only the CSRF token bound to this session', () => {
    const token = csrfTokenFor('session-a');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toBe(csrfTokenFor('session-b'));
    expect(csrfHeaderMatches({ 'x-csrf-token': token }, 'session-a')).toBe(true);
    expect(csrfHeaderMatches({ 'x-csrf-token': token }, 'session-b')).toBe(false);
    expect(csrfHeaderMatches({ 'x-csrf-token': 'short' }, 'session-a')).toBe(false);
    expect(csrfHeaderMatches({}, 'session-a')).toBe(false);
  });

  it('treats only GET, HEAD and OPTIONS as safe', () => {
    expect(['GET', 'head', 'OPTIONS'].map(isUnsafeMethod)).toEqual([false, false, false]);
    expect(['POST', 'PATCH', 'PUT', 'DELETE'].map(isUnsafeMethod)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(wantsCookieSession({ 'x-polycost-session': 'Cookie' })).toBe(true);
    expect(wantsCookieSession({})).toBe(false);
  });
});

describe('AuthService.authenticateRequest with a cookie', () => {
  function service(resolved: typeof IDENTITY | null = IDENTITY) {
    const repository = { resolveSession: jest.fn(async () => resolved ?? undefined) };
    return {
      auth: new AuthService(repository as never, { get: () => undefined } as never),
      repository,
    };
  }
  const cookie = { cookie: `${SESSION_COOKIE}=cookie-token` };

  it('reads the session from the cookie for safe requests', async () => {
    await expect(
      service().auth.authenticateRequest({ method: 'GET', headers: cookie }),
    ).resolves.toBe(IDENTITY);
  });

  it('refuses a cookie-authenticated change without the CSRF token', async () => {
    await expect(
      service().auth.authenticateRequest({ method: 'POST', headers: cookie }),
    ).rejects.toThrow('X-CSRF-Token');
    await expect(
      service().auth.authenticateRequest({
        method: 'POST',
        headers: { ...cookie, 'x-csrf-token': csrfTokenFor('another-session') },
      }),
    ).rejects.toThrow('X-CSRF-Token');
  });

  it('allows the change with the session-bound token', async () => {
    await expect(
      service().auth.authenticateRequest({
        method: 'DELETE',
        headers: { ...cookie, 'x-csrf-token': csrfTokenFor('cookie-token') },
      }),
    ).resolves.toBe(IDENTITY);
  });

  it('prefers a bearer token, which needs no CSRF token', async () => {
    const { auth, repository } = service();
    await expect(
      auth.authenticateRequest({
        method: 'POST',
        headers: { ...cookie, authorization: 'Bearer bearer-token' },
      }),
    ).resolves.toBe(IDENTITY);
    const [hash] = repository.resolveSession.mock.calls[0] as unknown as [string];
    expect(hash).not.toBe(undefined);
  });

  it('flags a dead cookie for clearing, but not a dead bearer token', async () => {
    const viaCookie: RequestWithAuth = { method: 'GET', headers: cookie };
    await expect(service(null).auth.authenticateRequest(viaCookie)).rejects.toThrow(
      'expired or invalid',
    );
    expect(viaCookie.clearSessionCookie).toBe(true);

    const viaBearer: RequestWithAuth = { method: 'GET', headers: { authorization: 'Bearer x' } };
    await expect(service(null).auth.authenticateRequest(viaBearer)).rejects.toThrow();
    expect(viaBearer.clearSessionCookie).toBeUndefined();
  });
});

describe('AuthController cookie sessions', () => {
  const session = {
    token: 'raw-token',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    account: { id: 'acct', email: 'a@example.com' },
  };

  function controller(secure = true) {
    const auth = {
      login: jest.fn(async () => session),
      me: jest.fn(async () => ({ account: session.account })),
      logout: jest.fn(async () => ({ revoked: true })),
    };
    const rateLimit = {
      consume: jest.fn(async () => ({ limit: 10, remaining: 9, resetSeconds: 60 })),
    };
    const config = { get: (key: string) => (key === 'AUTH_COOKIE_SECURE' ? secure : 10) };
    return new AuthController(auth as never, rateLimit as never, config as never);
  }
  function response() {
    const headers: Record<string, string> = {};
    return { headers, header: jest.fn((name: string, value: string) => (headers[name] = value)) };
  }

  it('keeps the token in the body for API clients', async () => {
    const reply = response();
    await expect(controller().login({}, { headers: {} }, reply as never)).resolves.toMatchObject({
      token: 'raw-token',
    });
    expect(reply.headers['set-cookie']).toBeUndefined();
  });

  it('moves the token into an HttpOnly cookie when the browser asks', async () => {
    const reply = response();
    const body = (await controller().login(
      {},
      { headers: { 'x-polycost-session': 'cookie' } },
      reply as never,
    )) as Record<string, unknown>;

    expect(body.token).toBeUndefined();
    expect(body.csrfToken).toBe(csrfTokenFor('raw-token'));
    expect(reply.headers['set-cookie']).toContain('polycost_session=raw-token');
    expect(reply.headers['set-cookie']).toContain('HttpOnly');
  });

  it('hands the CSRF token to a cookie session on /auth/me only', async () => {
    const viaCookie = await controller().me({
      headers: { cookie: `${SESSION_COOKIE}=raw-token` },
      auth: IDENTITY as never,
    });
    expect(viaCookie).toMatchObject({ csrfToken: csrfTokenFor('raw-token') });

    const viaBearer = await controller().me({
      headers: { authorization: 'Bearer raw-token', cookie: `${SESSION_COOKIE}=raw-token` },
      auth: IDENTITY as never,
    });
    expect(viaBearer).not.toHaveProperty('csrfToken');
  });

  it('clears the cookie on sign-out', async () => {
    const reply = response();
    await controller(false).logout({ headers: {}, auth: IDENTITY as never }, reply as never);
    expect(reply.headers['set-cookie']).toBe(clearedSessionCookie(false));
  });
});

describe('dead session cookie clearing', () => {
  it('clears a cookie the request flagged, without overriding one already set', async () => {
    let hook: ((...args: unknown[]) => Promise<unknown>) | undefined;
    registerDeadSessionCookieClearing(
      { addHook: (_name: string, fn: never) => (hook = fn) } as never,
      true,
    );
    const reply = { set: new Map<string, string>() } as {
      set: Map<string, string>;
      hasHeader?: (name: string) => boolean;
      header?: (name: string, value: string) => void;
    };
    reply.hasHeader = (name) => reply.set.has(name);
    reply.header = (name, value) => reply.set.set(name, value);

    await hook?.({ clearSessionCookie: true }, reply, 'body');
    expect(reply.set.get('set-cookie')).toBe(clearedSessionCookie(true));

    reply.set.set('set-cookie', 'fresh');
    await hook?.({ clearSessionCookie: true }, reply, 'body');
    expect(reply.set.get('set-cookie')).toBe('fresh');

    reply.set.clear();
    await expect(hook?.({}, reply, 'body')).resolves.toBe('body');
    expect(reply.set.size).toBe(0);
  });
});
