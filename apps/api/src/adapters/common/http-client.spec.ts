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
});
