import { describe, it, expect, jest } from '@jest/globals';
import { RegionsService } from './regions.service.js';

describe('RegionsService', () => {
  it('builds a live region catalog from public provider sources', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify({
            'US East (N. Virginia)': {
              code: 'us-east-1',
              label: 'US East (N. Virginia)',
              type: 'AWS Region',
              continent: 'North America',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        textResponse(`
          const data = [
            { "RegionName": "East US", "GeographyName": "United States" },
            { "RegionName": "Arizona **", "GeographyName": "United States" }
          ];
        `),
      )
      .mockResolvedValueOnce(
        textResponse(
          JSON.stringify({
            prefixes: [
              {
                service: 'Google Cloud',
                scope: 'us-central1',
              },
            ],
          }),
        ),
      );
    const service = RegionsService.withFetch(fetchMock);

    const catalog = await service.getRegionCatalog();

    expect(catalog.providers.map((provider) => provider.providerId)).toEqual([
      'aws',
      'azure',
      'gcp',
    ]);
    expect(catalog.providers.find((provider) => provider.providerId === 'aws')?.source).toBe(
      'live',
    );
    expect(
      catalog.providers.find((provider) => provider.providerId === 'aws')?.regions,
    ).toContainEqual(
      expect.objectContaining({
        id: 'us-east-1',
        label: 'US East (N. Virginia)',
        source: 'live',
      }),
    );
    expect(
      catalog.providers.find((provider) => provider.providerId === 'azure')?.regions,
    ).toContainEqual(
      expect.objectContaining({
        id: 'usgovarizona',
        label: 'Arizona',
        source: 'live',
      }),
    );
    expect(
      catalog.providers.find((provider) => provider.providerId === 'gcp')?.regions,
    ).toContainEqual(
      expect.objectContaining({
        id: 'us-central1',
        label: 'US Central (Iowa)',
        source: 'live',
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back per provider when a live source fails', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('aws down'))
      .mockResolvedValueOnce(
        textResponse('const data = [{ "RegionName": "East US", "GeographyName": "US" }];'),
      )
      .mockResolvedValueOnce(textResponse(JSON.stringify({ prefixes: [] })));
    const service = RegionsService.withFetch(fetchMock);

    const catalog = await service.getRegionCatalog();
    const aws = catalog.providers.find((provider) => provider.providerId === 'aws');
    const azure = catalog.providers.find((provider) => provider.providerId === 'azure');
    const gcp = catalog.providers.find((provider) => provider.providerId === 'gcp');

    expect(aws?.source).toBe('fallback');
    expect(aws?.regions.some((region) => region.id === 'us-east-1')).toBe(true);
    expect(azure?.source).toBe('live');
    expect(gcp?.source).toBe('fallback');
    expect(gcp?.regions.some((region) => region.id === 'us-central1')).toBe(true);
  });
});

function textResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: jest.fn<Response['text']>(async () => body),
  } as unknown as Response;
}
