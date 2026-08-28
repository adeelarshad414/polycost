import { assertSameProviderOrigin, parseJsonResponse } from './http-client';

// Build a minimal web-ReadableStream-like body that yields the given chunks, so
// tests can exercise the streaming read path (real fetch exposes getReader()).
function streamBody(chunks: Uint8Array[], opts: { hang?: boolean } = {}) {
  let index = 0;
  return {
    getReader() {
      return {
        read() {
          if (opts.hang) {
            return new Promise<never>(() => {});
          }
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            return Promise.resolve({ done: false, value });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
        releaseLock() {},
      };
    },
  };
}

const encoder = new TextEncoder();

describe('http-client', () => {
  it('parses successful JSON responses', async () => {
    await expect(
      parseJsonResponse('azure', {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"ok":true}',
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('throws provider-scoped errors for failed responses', async () => {
    await expect(
      parseJsonResponse('gcp', {
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        text: async () => 'provider unavailable',
      }),
    ).rejects.toThrow('[gcp] pricing API request failed with 503 Unavailable');
  });

  it('fails fast when Content-Length exceeds the buffer cap (does not read the body)', async () => {
    // e.g. the ~480 MB AWS EC2 bulk index — must not be buffered into memory.
    const text = jest.fn(async () => 'unreached');
    await expect(
      parseJsonResponse('aws', {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: (name) => (name.toLowerCase() === 'content-length' ? '480074423' : null) },
        text,
      }),
    ).rejects.toThrow(/too large to buffer safely/);
    expect(text).not.toHaveBeenCalled();
  });

  it('allows responses under the cap and without a Content-Length header', async () => {
    await expect(
      parseJsonResponse('azure', {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => '1024' },
        text: async () => '{"ok":true}',
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('enforces the byte cap while streaming a chunked body with no Content-Length (H-B1)', async () => {
    const oversized = streamBody([
      encoder.encode('12345'),
      encoder.encode('67890'),
      encoder.encode('AB'),
    ]);
    await expect(
      parseJsonResponse(
        'azure',
        {
          ok: true,
          status: 200,
          statusText: 'OK',
          // No Content-Length: the header pre-check cannot catch this; the cap
          // must be enforced during the streamed read.
          headers: { get: () => null },
          text: async () => 'unreached',
          body: oversized,
        },
        { maxBytes: 10 },
      ),
    ).rejects.toThrow(/too large to buffer safely/);
  });

  it('parses a chunked streamed body that stays under the cap (H-B1)', async () => {
    const body = streamBody([encoder.encode('{"ok"'), encoder.encode(':true}')]);
    await expect(
      parseJsonResponse('gcp', {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => 'unreached',
        body,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('times out a body that never completes downloading (H-B2)', async () => {
    await expect(
      parseJsonResponse(
        'aws',
        {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          text: async () => 'unreached',
          body: streamBody([], { hang: true }),
        },
        { bodyTimeoutMs: 40 },
      ),
    ).rejects.toThrow(/did not complete within 40 ms/);
  });

  describe('assertSameProviderOrigin (M-B1)', () => {
    const pinned = 'https://prices.azure.com/api/retail/prices';

    it('allows a same-origin pagination link', () => {
      expect(() =>
        assertSameProviderOrigin(
          'azure',
          'https://prices.azure.com/api/retail/prices?$skip=100',
          pinned,
        ),
      ).not.toThrow();
    });

    it('refuses a cross-host pagination link (SSRF)', () => {
      expect(() =>
        assertSameProviderOrigin('azure', 'https://169.254.169.254/latest/meta-data', pinned),
      ).toThrow(/possible SSRF/);
    });

    it('refuses a scheme downgrade to the same host', () => {
      expect(() =>
        assertSameProviderOrigin('azure', 'http://prices.azure.com/api/retail/prices', pinned),
      ).toThrow(/possible SSRF/);
    });

    it('refuses a non-absolute pagination link', () => {
      expect(() =>
        assertSameProviderOrigin('azure', '/api/retail/prices?$skip=100', pinned),
      ).toThrow(/not a valid absolute URL/);
    });
  });
});
