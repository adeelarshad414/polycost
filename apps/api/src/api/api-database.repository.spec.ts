import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { SecretsReader } from '../secrets/secrets.service';
import { ApiDatabaseRepository, PgPoolLike } from './api-database.repository';

const configService = {
  get: jest.fn((key: keyof AppConfig) => {
    switch (key) {
      case 'DB_HOST':
        return 'postgres';
      case 'DB_PORT':
        return 5432;
      case 'DB_NAME':
        return 'polycost_dev';
      default:
        return undefined;
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

const secretsReader: SecretsReader = {
  getSecret: jest.fn(async (_path: string, key: string) =>
    key === 'username' ? 'polycost_app' : 'app-password',
  ),
};

const comparisonResult: ComparisonResult = {
  comparisonId: '11111111-1111-4111-8111-111111111111',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [],
};

const nwsSnapshot: NormalizedWorkloadSpec = {
  schemaVersion: '1.0',
  metadata: {
    sourceType: 'structured_form',
    createdAt: '2026-06-29T00:00:00.000Z',
  },
  workload: {
    type: 'web_app',
    region: {
      isDefault: true,
    },
  },
  compute: [
    {
      role: 'web',
      scalingType: 'fixed',
    },
  ],
  storage: [],
  database: [],
  network: {
    cdn: false,
    loadBalancer: false,
  },
  availability: {
    multiAz: false,
    multiRegion: false,
  },
};

describe('ApiDatabaseRepository', () => {
  it('saves and retrieves comparison snapshots through the app DB role', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            nws_snapshot: nwsSnapshot,
            result_snapshot: comparisonResult,
          },
        ],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await repository.saveComparison(nwsSnapshot as never, comparisonResult as never);
    await expect(repository.getComparison(comparisonResult.comparisonId)).resolves.toEqual({
      nwsSnapshot,
      resultSnapshot: comparisonResult,
    });
    expect(secretsReader.getSecret).toHaveBeenCalledWith('polycost/db', 'username');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO comparisons'), [
      comparisonResult.comparisonId,
      JSON.stringify(nwsSnapshot),
      JSON.stringify(comparisonResult),
      comparisonResult.pricingAsOf,
    ]);
  });

  it('returns undefined for missing comparison snapshots', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
    );

    await expect(repository.getComparison(comparisonResult.comparisonId)).resolves.toBeUndefined();
  });

  it('returns latest pricing status for every provider', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            provider: 'aws',
            status: 'success',
            last_successful_run: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            provider: 'azure',
            status: 'failed',
            last_successful_run: null,
          },
        ],
        rowCount: 2,
      })),
    );

    await expect(repository.getPricingStatus()).resolves.toEqual({
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
        {
          providerId: 'azure',
          status: 'failed',
        },
        {
          providerId: 'gcp',
          status: 'failed',
        },
      ],
    });
  });
});

function createRepository(query: jest.Mock): ApiDatabaseRepository {
  const pool: PgPoolLike = {
    query,
    end: jest.fn(async () => undefined),
  };

  return new ApiDatabaseRepository(configService, secretsReader, () => pool);
}
