import { createPolyCostClient } from '../api-client';
import { resetWriteKeyCacheForTests, writeKeys } from './write-keys';

// ADR-0001 §3.4: the browser that created anonymous data keeps its edit key and
// sends it on every change, without callers having to pass it around.

const originalFetch = global.fetch;

function respond(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    json: jest.fn(async () => JSON.parse(text) as unknown),
  } as unknown as Response;
}

function headerOf(call: unknown[], name: string): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

const KEY = 'X-PolyCost-Write-Key';

describe('edit keys in the API client', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetWriteKeyCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('remembers a workload key and sends it on budget, share-link, revoke and alert changes', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(respond({ id: 'w-1', writeKey: 'key-w1' }))
      .mockResolvedValueOnce(respond({ id: 'b-1' }))
      .mockResolvedValueOnce(respond({ token: 't-1', url: '/api/v1/share/t-1' }))
      .mockResolvedValueOnce(respond({ token: 't-1', url: '/api/v1/share/t-1' }))
      .mockResolvedValueOnce(respond([{ id: 'a-1', workloadId: 'w-1' }]))
      .mockResolvedValueOnce(respond({ id: 'a-1', workloadId: 'w-1', dismissed: true }));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createWorkload({} as never);
    await client.createBudget({ workloadId: 'w-1', thresholdUsd: 10 } as never);
    await client.createShareLink({ workloadId: 'w-1', expiresInDays: 30 } as never);
    await client.revokeShareLink('t-1');
    await client.listAlerts('w-1');
    await client.updateAlertDismissed('a-1', true);

    const calls = fetchMock.mock.calls;
    expect(headerOf(calls[0], KEY)).toBeUndefined();
    expect(headerOf(calls[1], KEY)).toBe('key-w1');
    expect(headerOf(calls[2], KEY)).toBe('key-w1');
    expect(headerOf(calls[3], KEY)).toBe('key-w1');
    expect(headerOf(calls[5], KEY)).toBe('key-w1');
  });

  it('carries a comparison key onto its live refresh', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(respond({ comparisonId: 'c-1', writeKey: 'key-c1', providers: [] }))
      .mockResolvedValueOnce(respond({ comparisonId: 'c-2', providers: [] }));
    global.fetch = fetchMock as typeof fetch;
    const client = createPolyCostClient('http://api.test/api/v1');

    await client.createComparison({} as never);
    await client.refreshLiveComparison('c-1');

    expect(headerOf(fetchMock.mock.calls[1], KEY)).toBe('key-c1');
    expect(writeKeys.comparisonKey('c-2')).toBe('key-c1');
  });

  it('sends nothing for data it did not create, and forgets everything on clear', async () => {
    writeKeys.rememberWorkload('w-9', 'key-w9');
    writeKeys.clear();
    resetWriteKeyCacheForTests();

    expect(writeKeys.workloadKey('w-9')).toBeUndefined();
    expect(writeKeys.alertKey('unknown')).toBeUndefined();
  });

  it('keeps working when storage is unavailable', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    writeKeys.rememberWorkload('w-2', 'key-w2');
    expect(writeKeys.workloadKey('w-2')).toBe('key-w2');
    setItem.mockRestore();
  });
});
