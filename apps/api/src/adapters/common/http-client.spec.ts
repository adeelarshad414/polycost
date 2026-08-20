import { parseJsonResponse } from './http-client';

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
});
