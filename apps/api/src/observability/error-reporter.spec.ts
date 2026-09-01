import { ErrorReporter, parseDsn, redactValue } from './error-reporter';

const DSN = 'https://publickey123@glitchtip.internal/7';

describe('parseDsn', () => {
  it('derives the envelope endpoint and key', () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: 'https://glitchtip.internal/api/7/envelope/',
      publicKey: 'publickey123',
    });
  });

  it.each([
    ['not a url', 'nonsense'],
    ['no public key', 'https://glitchtip.internal/7'],
    ['no project id', 'https://publickey123@glitchtip.internal'],
  ])('returns undefined for %s', (_label, dsn) => {
    expect(parseDsn(dsn)).toBeUndefined();
  });
});

describe('redactValue', () => {
  it.each([
    'authorization',
    'cookie',
    'password',
    'token',
    'secret',
    'apikey',
    'access_token',
    'passwordhash',
    'email',
  ])('redacts %s regardless of case', (key) => {
    expect(redactValue({ [key]: 'sensitive' })).toEqual({ [key]: '[redacted]' });
    expect(redactValue({ [key.toUpperCase()]: 'sensitive' })).toEqual({
      [key.toUpperCase()]: '[redacted]',
    });
  });

  it('redacts nested values, not just top-level keys', () => {
    expect(redactValue({ request: { headers: { Authorization: 'Bearer abc' } } })).toEqual({
      request: { headers: { Authorization: '[redacted]' } },
    });
  });

  it('redacts inside arrays', () => {
    expect(redactValue({ users: [{ email: 'a@b.c' }, { email: 'd@e.f' }] })).toEqual({
      users: [{ email: '[redacted]' }, { email: '[redacted]' }],
    });
  });

  it('keeps non-sensitive values intact', () => {
    expect(redactValue({ statusCode: 500, code: 'INTERNAL_ERROR' })).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  });

  it('stops recursing on deeply nested input rather than hanging', () => {
    let deep: Record<string, unknown> = { password: 'leaf' };
    for (let i = 0; i < 50; i += 1) {
      deep = { nested: deep };
    }

    expect(() => redactValue(deep)).not.toThrow();
  });

  it('caps long arrays so one payload cannot be unbounded', () => {
    const output = redactValue({ items: Array.from({ length: 500 }, (_, i) => i) }) as {
      items: unknown[];
    };

    expect(output.items).toHaveLength(50);
  });
});

describe('ErrorReporter', () => {
  it('is disabled without a DSN and sends nothing', async () => {
    const fetchImpl = jest.fn();
    const reporter = new ErrorReporter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(reporter.enabled).toBe(false);
    await reporter.report(new Error('boom'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is disabled when the DSN is malformed rather than sending to nowhere', () => {
    expect(new ErrorReporter({ dsn: 'nonsense' }).enabled).toBe(false);
  });

  it('captures the error type, message and stack frames', () => {
    const event = new ErrorReporter({ dsn: DSN }).buildEvent(new TypeError('bad input'));
    const [value] = (event.exception as { values: Array<Record<string, unknown>> }).values;

    expect(value.type).toBe('TypeError');
    expect(value.value).toBe('bad input');
    expect((value.stacktrace as { frames: unknown[] }).frames.length).toBeGreaterThan(0);
  });

  it('handles a thrown non-Error', () => {
    const event = new ErrorReporter({ dsn: DSN }).buildEvent('just a string');
    const [value] = (event.exception as { values: Array<Record<string, unknown>> }).values;

    expect(value.value).toBe('just a string');
  });

  it('redacts the context before it leaves the process', () => {
    const event = new ErrorReporter({ dsn: DSN }).buildEvent(new Error('boom'), {
      statusCode: 500,
      headers: { authorization: 'Bearer super-secret' },
    });

    expect(JSON.stringify(event)).not.toContain('super-secret');
    expect(event.extra).toEqual({
      statusCode: 500,
      headers: { authorization: '[redacted]' },
    });
  });

  it('posts a Sentry envelope with the auth header', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true }) as Response);
    const reporter = new ErrorReporter({
      dsn: DSN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await reporter.report(new Error('boom'));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://glitchtip.internal/api/7/envelope/');
    expect((init.headers as Record<string, string>)['X-Sentry-Auth']).toContain(
      'sentry_key=publickey123',
    );

    // Three newline-delimited JSON lines: envelope header, item header, payload.
    const lines = String(init.body).split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: 'event' });
    expect(JSON.parse(lines[0]).event_id).toBe(JSON.parse(lines[2]).event_id);
  });

  it('never rejects when the collector is unreachable', async () => {
    const onError = jest.fn();
    const reporter = new ErrorReporter({
      dsn: DSN,
      onError,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });

    // A failure to report an error must not become an error on the response path.
    await expect(reporter.report(new Error('boom'))).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it('gives each event a distinct 32-character id', () => {
    const reporter = new ErrorReporter({ dsn: DSN });
    const first = reporter.buildEvent(new Error('a')).event_id as string;
    const second = reporter.buildEvent(new Error('b')).event_id as string;

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });
});
