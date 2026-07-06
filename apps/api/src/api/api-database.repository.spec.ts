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

  it('records comparison audit rows from provider line items', async () => {
    const query = jest.fn(async () => ({
      rows: [],
      rowCount: 1,
    }));
    const repository = createRepository(query);

    await repository.recordComparisonAuditLog({
      ...comparisonResult,
      providers: [
        {
          providerId: 'aws',
          totals: {
            daily: 1,
            weekly: 7,
            monthly: 30,
            quarterly: 90,
            yearly: 360,
          },
          lineItems: [
            {
              category: 'compute',
              costComponent: 'compute',
              description: 'web compute',
              isApproximate: false,
              baseMonthlyCostUsd: 30,
              baseHourlyCostUsd: 0.0411,
              skuId: 'm7i.large',
              region: 'us-east-1',
              unitPriceUsd: 0.0411,
              unit: 'Hrs',
              pricingBasis: 'flat',
              rateSource: 'pricing_catalog',
              rateSourceSkuId: 'm7i.large',
              pricingTermCode: 'on-demand',
              rateCurrency: 'USD',
              rateValidFrom: '2026-07-01T00:00:00.000Z',
              rateSourceFetchedAt: '2026-07-01T02:00:00.000Z',
              pricingTrace: {
                providerId: 'aws',
                serviceCategory: 'compute',
                costComponent: 'compute',
                source: 'pricing_catalog',
                sourceRecordKey: 'aws|compute|m7i.large|us-east-1|Hrs|2026-07-01T00:00:00.000Z',
                resolvedSkuId: 'm7i.large',
                sourceSkuId: 'm7i.large',
                region: 'us-east-1',
                catalogRegion: 'us-east-1',
                unit: 'Hrs',
                unitPriceUsd: 0.0411,
                currency: 'USD',
                effectiveDate: '2026-07-01T00:00:00.000Z',
                fetchedAt: '2026-07-01T02:00:00.000Z',
                pricingTermCode: 'on-demand',
                pricingBasis: 'flat',
                isApproximate: false,
                isEstimate: false,
              },
            },
          ],
        },
      ],
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('comparison_audit_logs'), [
      expect.any(String),
    ]);
    const firstCall = query.mock.calls[0] as unknown as [string, unknown[]];
    const auditRows = JSON.parse(String(firstCall[1][0]));

    expect(auditRows).toEqual([
      expect.objectContaining({
        comparison_id: comparisonResult.comparisonId,
        provider: 'aws',
        service_category: 'compute',
        cost_component: 'compute',
        service_label: 'web compute',
        resolved_sku_id: 'm7i.large',
        provider_region: 'us-east-1',
        confidence: 'direct',
        rate_used_usd: 0.0411,
        rate_source: 'pricing_catalog',
        rate_source_sku_id: 'm7i.large',
        pricing_term_code: 'on-demand',
        payment_option_code: null,
        rate_currency: 'USD',
        rate_unit: 'Hrs',
        rate_valid_from: '2026-07-01T00:00:00.000Z',
        rate_source_fetched_at: '2026-07-01T02:00:00.000Z',
        pricing_trace: expect.objectContaining({
          sourceRecordKey: 'aws|compute|m7i.large|us-east-1|Hrs|2026-07-01T00:00:00.000Z',
          source: 'pricing_catalog',
          unitPriceUsd: 0.0411,
        }),
        monthly_cost_usd: 30,
        pricing_basis: 'flat',
        is_approximate: false,
      }),
    ]);
  });

  it('returns latest pricing status for every provider', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            provider: 'aws',
            status: 'success',
            records_updated: 12,
            records_rejected: 1,
            records_skipped: 7,
            last_successful_run: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            provider: 'azure',
            status: 'failed',
            records_updated: 0,
            records_rejected: 3,
            records_skipped: 0,
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
          recordsUpdated: 12,
          recordsRejected: 1,
          recordsSkipped: 7,
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
        {
          providerId: 'azure',
          status: 'failed',
          recordsUpdated: 0,
          recordsRejected: 3,
          recordsSkipped: 0,
        },
        {
          providerId: 'gcp',
          status: 'failed',
          recordsUpdated: 0,
          recordsRejected: 0,
          recordsSkipped: 0,
        },
      ],
    });
  });

  it('summarizes provider freshness through the data-health response', async () => {
    const repository = createRepository(
      jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              provider: 'aws',
              status: 'success',
              records_updated: 12,
              records_rejected: 0,
              records_skipped: 7,
              last_successful_run: new Date('2026-06-30T12:00:00.000Z'),
            },
            {
              provider: 'azure',
              status: 'success',
              records_updated: 9,
              records_rejected: 1,
              records_skipped: 0,
              last_successful_run: new Date('2026-06-28T00:00:00.000Z'),
            },
            {
              provider: 'gcp',
              status: 'failed',
              records_updated: 0,
              records_rejected: 3,
              records_skipped: 0,
              last_successful_run: null,
            },
          ],
          rowCount: 3,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              provider: 'aws',
              catalog_rows: '30',
              current_rate_rows: '18',
              latest_catalog_sync_at: new Date('2026-06-30T11:00:00.000Z'),
              latest_rate_sync_at: new Date('2026-06-30T12:00:00.000Z'),
              catalog_success_rows: '30',
              catalog_partial_rows: '0',
              catalog_failed_rows: '0',
              rate_success_rows: '18',
              rate_partial_rows: '0',
              rate_failed_rows: '0',
            },
            {
              provider: 'azure',
              catalog_rows: '20',
              current_rate_rows: '9',
              latest_catalog_sync_at: new Date('2026-06-28T00:00:00.000Z'),
              latest_rate_sync_at: new Date('2026-06-28T00:00:00.000Z'),
              catalog_success_rows: '18',
              catalog_partial_rows: '2',
              catalog_failed_rows: '0',
              rate_success_rows: '9',
              rate_partial_rows: '0',
              rate_failed_rows: '0',
            },
          ],
          rowCount: 2,
        }),
    );

    await expect(repository.getDataHealth(new Date('2026-07-01T00:00:00.000Z'))).resolves.toEqual({
      generatedAt: '2026-07-01T00:00:00.000Z',
      freshnessPolicyHours: 48,
      overallStatus: 'degraded',
      alertCount: 2,
      alerts: [
        {
          providerId: 'azure',
          severity: 'warning',
          message:
            'Pricing data is 72h old against the 48h policy; refresh before production decisions.',
        },
        {
          providerId: 'gcp',
          severity: 'critical',
          message: 'Latest provider sync failed; use cached data with caution.',
        },
      ],
      providers: [
        expect.objectContaining({
          providerId: 'aws',
          freshness: 'fresh',
          ageHours: 12,
          cache: expect.objectContaining({
            catalogRows: 30,
            currentRateRows: 18,
            ageHours: 12,
            freshness: 'fresh',
            syncStatusCounts: {
              success: 48,
              partial: 0,
              failed: 0,
            },
          }),
        }),
        expect.objectContaining({
          providerId: 'azure',
          freshness: 'stale',
          ageHours: 72,
          cache: expect.objectContaining({
            catalogRows: 20,
            currentRateRows: 9,
            ageHours: 72,
            freshness: 'stale',
            syncStatusCounts: {
              success: 27,
              partial: 2,
              failed: 0,
            },
          }),
        }),
        expect.objectContaining({
          providerId: 'gcp',
          freshness: 'failed',
          cache: expect.objectContaining({
            catalogRows: 0,
            currentRateRows: 0,
            freshness: 'missing',
          }),
        }),
      ],
    });
  });

  it('creates, transitions, and reads report export jobs', async () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z');
    const startedAt = new Date('2026-07-01T00:00:05.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            comparison_id: comparisonResult.comparisonId,
            format: 'pdf',
            interval: 'monthly',
            pricing_model: 'reserved-1yr',
            status: 'pending',
            file_name: null,
            content_type: null,
            error_message: null,
            created_at: createdAt,
            started_at: null,
            completed_at: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            comparison_id: comparisonResult.comparisonId,
            format: 'pdf',
            interval: 'monthly',
            pricing_model: 'reserved-1yr',
            status: 'running',
            file_name: null,
            content_type: null,
            error_message: null,
            created_at: createdAt,
            started_at: startedAt,
            completed_at: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.createReportExportJob({
        comparisonId: comparisonResult.comparisonId,
        format: 'pdf',
        interval: 'monthly',
        pricingModel: 'reserved-1yr',
      }),
    ).resolves.toEqual({
      jobId: '66666666-6666-4666-8666-666666666666',
      comparisonId: comparisonResult.comparisonId,
      format: 'pdf',
      interval: 'monthly',
      pricingModel: 'reserved-1yr',
      status: 'pending',
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    await expect(
      repository.getReportExportJob(
        comparisonResult.comparisonId,
        '66666666-6666-4666-8666-666666666666',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'running',
        startedAt: '2026-07-01T00:00:05.000Z',
      }),
    );
    await repository.markReportExportJobRunning(
      '66666666-6666-4666-8666-666666666666',
      '2026-07-01T00:00:05.000Z',
    );
    await repository.completeReportExportJob(
      '66666666-6666-4666-8666-666666666666',
      {
        fileName: 'polycost-comparison.pdf',
        contentType: 'application/pdf',
        content: Buffer.from('pdf'),
      },
      '2026-07-01T00:00:10.000Z',
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO report_export_jobs'),
      [comparisonResult.comparisonId, 'pdf', 'monthly', 'reserved-1yr'],
    );
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("SET status = 'running'"), [
      '66666666-6666-4666-8666-666666666666',
      '2026-07-01T00:00:05.000Z',
    ]);
    expect(query).toHaveBeenNthCalledWith(4, expect.stringContaining("SET status = 'completed'"), [
      '66666666-6666-4666-8666-666666666666',
      'polycost-comparison.pdf',
      'application/pdf',
      Buffer.from('pdf'),
      '2026-07-01T00:00:10.000Z',
    ]);
  });

  it('reads completed report export artifacts and records export failures', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            comparison_id: comparisonResult.comparisonId,
            format: 'xlsx',
            interval: 'yearly',
            pricing_model: 'on-demand',
            status: 'completed',
            file_name: 'polycost-comparison.xlsx',
            content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            artifact: Buffer.from('xlsx'),
            error_message: null,
            created_at: new Date('2026-07-01T00:00:00.000Z'),
            started_at: new Date('2026-07-01T00:00:05.000Z'),
            completed_at: new Date('2026-07-01T00:00:10.000Z'),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.getReportExportJobArtifact(
        comparisonResult.comparisonId,
        '66666666-6666-4666-8666-666666666666',
      ),
    ).resolves.toEqual({
      job: expect.objectContaining({
        fileName: 'polycost-comparison.xlsx',
        status: 'completed',
      }),
      content: Buffer.from('xlsx'),
    });
    await repository.failReportExportJob(
      '66666666-6666-4666-8666-666666666666',
      'Generation failed',
      '2026-07-01T00:00:12.000Z',
    );

    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("SET status = 'failed'"), [
      '66666666-6666-4666-8666-666666666666',
      'Generation failed',
      '2026-07-01T00:00:12.000Z',
    ]);
  });

  it('creates, starts, and finishes comparison prewarm jobs', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            comparison_id: comparisonResult.comparisonId,
            status: 'pending',
            requested_combinations: 8,
            warmed_combinations: 0,
            failed_combinations: 0,
            error_message: null,
            created_at: new Date('2026-07-01T00:00:00.000Z'),
            started_at: null,
            completed_at: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.createComparisonPrewarmJob({
        comparisonId: comparisonResult.comparisonId,
        requestedCombinations: 8,
      }),
    ).resolves.toEqual({
      jobId: '77777777-7777-4777-8777-777777777777',
      comparisonId: comparisonResult.comparisonId,
      status: 'pending',
      requestedCombinations: 8,
      warmedCombinations: 0,
      failedCombinations: 0,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    await repository.markComparisonPrewarmJobRunning(
      '77777777-7777-4777-8777-777777777777',
      '2026-07-01T00:00:01.000Z',
    );
    await repository.finishComparisonPrewarmJob('77777777-7777-4777-8777-777777777777', {
      status: 'completed',
      warmedCombinations: 7,
      failedCombinations: 1,
      completedAt: '2026-07-01T00:00:02.000Z',
      errorMessage: 'reserved rate missing',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO comparison_prewarm_jobs'),
      [comparisonResult.comparisonId, 8],
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("SET status = 'running'"), [
      '77777777-7777-4777-8777-777777777777',
      '2026-07-01T00:00:01.000Z',
    ]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('warmed_combinations = $3'), [
      '77777777-7777-4777-8777-777777777777',
      'completed',
      7,
      1,
      'reserved rate missing',
      '2026-07-01T00:00:02.000Z',
    ]);
  });

  it('creates normalized workload records through the app DB role', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            instance_family: 'general-purpose',
            vcpu: 4,
            memory_gb: '16',
            region: 'us-east',
            instance_count: 2,
            hours_per_month: '730',
            storage_gb: '500',
            storage_tier: 'standard',
            egress_gb_per_month: '1200',
            created_at: new Date('2026-06-29T00:00:00.000Z'),
            updated_at: new Date('2026-06-29T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      })),
    );

    await expect(
      repository.createWorkload({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'us-east',
        instanceCount: 2,
        hoursPerMonth: 730,
        storageGb: 500,
        storageTier: 'standard',
        egressGbPerMonth: 1200,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        instanceFamily: 'general-purpose',
        memoryGb: 16,
        region: 'us-east',
      }),
    );
  });

  it('compares normalized cached pricing across canonical provider regions', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          provider: 'aws',
          provider_sku_id: 'm7i.xlarge',
          sku_id: '33333333-3333-4333-8333-333333333333',
          price_per_hour: '0.19200000',
          term: 'on_demand',
          region: 'us-east-1',
          currency: 'USD',
          effective_date: new Date('2026-06-29T00:00:00.000Z'),
        },
      ],
      rowCount: 1,
    }));
    const repository = createRepository(query);

    await expect(
      repository.compareCachedPricing({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'us-east',
        term: 'on_demand',
      }),
    ).resolves.toEqual([
      {
        provider: 'aws',
        providerSkuId: 'm7i.xlarge',
        skuId: '33333333-3333-4333-8333-333333333333',
        pricePerHour: 0.192,
        term: 'on_demand',
        region: 'us-east-1',
        currency: 'USD',
        effectiveDate: '2026-06-29T00:00:00.000Z',
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM requested_regions'), [
      'general-purpose',
      4,
      16,
      'us-east-1',
      'eastus',
      'us-east1',
      'on_demand',
    ]);
  });

  it('returns cached exchange rates keyed by quote currency', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            quote_currency: 'EUR',
            rate: '0.93000000',
            fetched_at: new Date('2026-06-29T00:00:00.000Z'),
          },
          {
            quote_currency: 'PKR',
            rate: '278.00000000',
            fetched_at: new Date('2026-06-29T01:00:00.000Z'),
          },
        ],
        rowCount: 2,
      })),
    );

    await expect(repository.getExchangeRates('USD')).resolves.toEqual({
      base: 'USD',
      lastUpdated: '2026-06-29T01:00:00.000Z',
      rates: {
        EUR: 0.93,
        PKR: 278,
      },
    });
  });

  it('lists budgets with workload details for modeled-cost evaluation', async () => {
    const repository = createRepository(
      jest.fn(async () => ({
        rows: [
          {
            budget_id: '11111111-1111-4111-8111-111111111111',
            workload_id: '22222222-2222-4222-8222-222222222222',
            threshold_usd: '900.00',
            alert_on_anomaly_percent: '20.00',
            budget_created_at: new Date('2026-06-20T00:00:00.000Z'),
            budget_updated_at: new Date('2026-06-29T00:00:00.000Z'),
            instance_family: 'general-purpose',
            vcpu: 4,
            memory_gb: '16',
            region: 'us-east',
            instance_count: 2,
            hours_per_month: '730',
            storage_gb: '500',
            storage_tier: 'standard',
            egress_gb_per_month: '1200',
            workload_created_at: new Date('2026-06-19T00:00:00.000Z'),
            workload_updated_at: new Date('2026-06-28T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      })),
    );

    await expect(repository.listBudgetsForEvaluation()).resolves.toEqual([
      {
        budget: {
          id: '11111111-1111-4111-8111-111111111111',
          workloadId: '22222222-2222-4222-8222-222222222222',
          thresholdUsd: 900,
          alertOnAnomalyPercent: 20,
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        },
        workload: expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          createdAt: '2026-06-19T00:00:00.000Z',
          updatedAt: '2026-06-28T00:00:00.000Z',
        }),
      },
    ]);
  });

  it('upserts exchange-rate snapshots and cleans up expired share links', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const repository = createRepository(query);

    await expect(
      repository.upsertExchangeRates({
        baseCurrency: 'USD',
        rates: {
          EUR: 0.87673,
          GBP: 0.75587,
        },
        source: 'https://api.frankfurter.app/latest',
        fetchedAt: '2026-06-30T00:00:00.000Z',
      }),
    ).resolves.toBe(2);
    await expect(repository.cleanupExpiredShareLinks('2026-06-30T00:00:00.000Z')).resolves.toBe(3);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO exchange_rates'),
      ['USD', 'EUR', 0.87673, 'https://api.frankfurter.app/latest', '2026-06-30T00:00:00.000Z'],
    );
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE share_links'), [
      '2026-06-30T00:00:00.000Z',
    ]);
  });

  it('records and summarizes non-PII share-link analytics', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ token: 'share-token-12345678901234567890' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            country_code: 'US',
            section: 'summary',
            views: '2',
            last_viewed_at: new Date('2026-07-01T00:00:00.000Z'),
          },
          {
            country_code: 'CA',
            section: 'engineering',
            views: '1',
            last_viewed_at: new Date('2026-06-30T00:00:00.000Z'),
          },
        ],
        rowCount: 2,
      });
    const repository = createRepository(query);

    await repository.recordShareLinkEvent({
      token: 'share-token-12345678901234567890',
      countryCode: 'US',
      section: 'summary',
      userAgentHash: 'hash',
      viewedAt: '2026-07-01T00:00:00.000Z',
    });
    await expect(
      repository.getShareLinkAnalytics('share-token-12345678901234567890'),
    ).resolves.toEqual({
      token: 'share-token-12345678901234567890',
      totalViews: 3,
      lastViewedAt: '2026-07-01T00:00:00.000Z',
      countryViews: [
        { countryCode: 'US', views: 2 },
        { countryCode: 'CA', views: 1 },
      ],
      sectionViews: [
        { section: 'summary', views: 2, lastViewedAt: '2026-07-01T00:00:00.000Z' },
        { section: 'engineering', views: 1, lastViewedAt: '2026-06-30T00:00:00.000Z' },
      ],
    });
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('share_link_events'), [
      'share-token-12345678901234567890',
      'US',
      'summary',
      'hash',
      '2026-07-01T00:00:00.000Z',
    ]);
  });

  it('persists local auth accounts and resolves session/team context', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const expiresAt = new Date('2026-07-07T00:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'architect@example.com',
            display_name: 'Architect',
            status: 'active',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Architecture team',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: '11111111-1111-4111-8111-111111111111',
            email: 'architect@example.com',
            display_name: 'Architect',
            status: 'active',
            password_hash: 'scrypt:v1:hash',
            failed_attempts: 2,
            locked_until: null,
            team_id: '22222222-2222-4222-8222-222222222222',
            team_name: 'Architecture team',
            role: 'owner',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            expires_at: expiresAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: '33333333-3333-4333-8333-333333333333',
            account_id: '11111111-1111-4111-8111-111111111111',
            email: 'architect@example.com',
            display_name: 'Architect',
            team_id: '22222222-2222-4222-8222-222222222222',
            team_name: 'Architecture team',
            role: 'owner',
            expires_at: expiresAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            team_id: '22222222-2222-4222-8222-222222222222',
            team_name: 'Architecture team',
            role: 'owner',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            team_id: '22222222-2222-4222-8222-222222222222',
            team_name: 'Architecture team',
            role: 'admin',
          },
        ],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.createLocalAccountWithTeam({
        email: 'architect@example.com',
        displayName: 'Architect',
        externalSubjectHash: 'a'.repeat(64),
        passwordHash: 'scrypt:v1:hash',
        teamName: 'Architecture team',
        teamSlug: 'architecture-team',
      }),
    ).resolves.toEqual({
      accountId: '11111111-1111-4111-8111-111111111111',
      email: 'architect@example.com',
      displayName: 'Architect',
      status: 'active',
      passwordHash: 'scrypt:v1:hash',
      failedAttempts: 0,
      defaultTeam: {
        teamId: '22222222-2222-4222-8222-222222222222',
        teamName: 'Architecture team',
        role: 'owner',
      },
    });
    await expect(repository.findLocalAccountByEmail('architect@example.com')).resolves.toEqual(
      expect.objectContaining({
        accountId: '11111111-1111-4111-8111-111111111111',
        failedAttempts: 2,
        defaultTeam: expect.objectContaining({
          role: 'owner',
        }),
      }),
    );

    await repository.recordFailedLogin({
      accountId: '11111111-1111-4111-8111-111111111111',
      failedAttempts: 3,
      lockedUntil: '2026-07-06T00:15:00.000Z',
    });
    await repository.resetFailedLogin('11111111-1111-4111-8111-111111111111');
    await expect(
      repository.createSession({
        accountId: '11111111-1111-4111-8111-111111111111',
        teamId: '22222222-2222-4222-8222-222222222222',
        tokenHash: 'b'.repeat(64),
        expiresAt: expiresAt.toISOString(),
        userAgentHash: 'c'.repeat(64),
        ipHash: 'd'.repeat(64),
      }),
    ).resolves.toEqual({
      sessionId: '33333333-3333-4333-8333-333333333333',
      expiresAt: expiresAt.toISOString(),
    });
    await expect(
      repository.resolveSession('b'.repeat(64), createdAt.toISOString()),
    ).resolves.toEqual({
      accountId: '11111111-1111-4111-8111-111111111111',
      email: 'architect@example.com',
      displayName: 'Architect',
      teamId: '22222222-2222-4222-8222-222222222222',
      role: 'owner',
      sessionId: '33333333-3333-4333-8333-333333333333',
      expiresAt: expiresAt.toISOString(),
    });
    await repository.revokeSession('33333333-3333-4333-8333-333333333333', createdAt.toISOString());
    await expect(
      repository.listAccountTeams('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual([
      {
        teamId: '22222222-2222-4222-8222-222222222222',
        teamName: 'Architecture team',
        role: 'owner',
      },
    ]);
    await expect(
      repository.getTeamMembership({
        accountId: '11111111-1111-4111-8111-111111111111',
        teamId: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toEqual({
      teamId: '22222222-2222-4222-8222-222222222222',
      teamName: 'Architecture team',
      role: 'admin',
    });

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(6, 'COMMIT');
    expect(query).toHaveBeenNthCalledWith(8, expect.stringContaining('failed_attempts = $2'), [
      '11111111-1111-4111-8111-111111111111',
      3,
      '2026-07-06T00:15:00.000Z',
    ]);
  });

  it('manages team invitations, members, and SSO provider config rows', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const lastActiveAt = new Date('2026-07-06T00:05:00.000Z');
    const expiresAt = new Date('2026-07-13T00:00:00.000Z');
    const acceptedAt = new Date('2026-07-06T00:10:00.000Z');
    const pendingInvitation = {
      id: '88888888-8888-4888-8888-888888888888',
      team_id: '22222222-2222-4222-8222-222222222222',
      email: 'finops@example.com',
      role: 'admin',
      status: 'pending',
      invited_by_account_id: '11111111-1111-4111-8111-111111111111',
      accepted_by_account_id: null,
      expires_at: expiresAt,
      created_at: createdAt,
      accepted_at: null,
      revoked_at: null,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: '11111111-1111-4111-8111-111111111111',
            email: 'architect@example.com',
            display_name: 'Architect',
            role: 'owner',
            created_at: createdAt,
            last_active_at: lastActiveAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [pendingInvitation],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            ...pendingInvitation,
            status: 'expired',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [pendingInvitation],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            ...pendingInvitation,
            token_hash: 'e'.repeat(64),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            ...pendingInvitation,
            status: 'accepted',
            accepted_by_account_id: '11111111-1111-4111-8111-111111111111',
            accepted_at: acceptedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ owners: '2' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: '11111111-1111-4111-8111-111111111111',
            email: 'architect@example.com',
            display_name: 'Architect',
            role: 'admin',
            created_at: createdAt,
            last_active_at: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            provider_type: 'oidc',
            display_name: 'Corporate OIDC',
            issuer_url: 'https://idp.example.com',
            status: 'configured',
          },
          {
            provider_type: 'saml',
            display_name: 'Corporate SAML',
            issuer_url: 'https://sso.example.com/saml',
            status: 'draft',
          },
        ],
        rowCount: 2,
      });
    const repository = createRepository(query);

    await expect(
      repository.listTeamMembers('22222222-2222-4222-8222-222222222222'),
    ).resolves.toEqual([
      {
        accountId: '11111111-1111-4111-8111-111111111111',
        email: 'architect@example.com',
        displayName: 'Architect',
        role: 'owner',
        createdAt: createdAt.toISOString(),
        lastActiveAt: lastActiveAt.toISOString(),
      },
    ]);
    await expect(
      repository.createTeamInvitation({
        teamId: '22222222-2222-4222-8222-222222222222',
        email: 'finops@example.com',
        role: 'admin',
        tokenHash: 'e'.repeat(64),
        invitedByAccountId: '11111111-1111-4111-8111-111111111111',
        expiresAt: expiresAt.toISOString(),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        email: 'finops@example.com',
        role: 'admin',
        status: 'pending',
      }),
    );
    await expect(
      repository.listTeamInvitations('22222222-2222-4222-8222-222222222222'),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'expired',
      }),
    ]);
    await expect(
      repository.findPendingInvitationByTokenHash('e'.repeat(64), createdAt.toISOString()),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '88888888-8888-4888-8888-888888888888',
      }),
    );
    await expect(
      repository.acceptTeamInvitation({
        invitationId: '88888888-8888-4888-8888-888888888888',
        accountId: '11111111-1111-4111-8111-111111111111',
        acceptedAt: acceptedAt.toISOString(),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'accepted',
        acceptedByAccountId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    await expect(repository.countTeamOwners('22222222-2222-4222-8222-222222222222')).resolves.toBe(
      2,
    );
    await expect(
      repository.updateTeamMemberRole({
        teamId: '22222222-2222-4222-8222-222222222222',
        accountId: '11111111-1111-4111-8111-111111111111',
        role: 'admin',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        role: 'admin',
      }),
    );
    await expect(
      repository.removeTeamMember({
        teamId: '22222222-2222-4222-8222-222222222222',
        accountId: '11111111-1111-4111-8111-111111111111',
      }),
    ).resolves.toBe(true);
    await expect(
      repository.listSsoProviderConfigs('22222222-2222-4222-8222-222222222222'),
    ).resolves.toEqual([
      {
        providerType: 'oidc',
        displayName: 'Corporate OIDC',
        issuerUrl: 'https://idp.example.com',
        status: 'configured',
      },
      {
        providerType: 'saml',
        displayName: 'Corporate SAML',
        issuerUrl: 'https://sso.example.com/saml',
        status: 'draft',
      },
    ]);

    expect(query).toHaveBeenNthCalledWith(5, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(9, 'COMMIT');
  });

  it('persists provider invoice imports and reconciliation evidence rows', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const completedAt = new Date('2026-07-06T00:00:02.000Z');
    const usageStart = new Date('2026-06-01T00:00:00.000Z');
    const usageEnd = new Date('2026-06-30T23:59:59.000Z');
    const importRow = {
      id: '55555555-5555-4555-8555-555555555555',
      team_id: '22222222-2222-4222-8222-222222222222',
      provider: 'aws',
      source_type: 'aws-cur',
      status: 'completed',
      billing_period_start: new Date('2026-06-01T00:00:00.000Z'),
      billing_period_end: new Date('2026-06-30T00:00:00.000Z'),
      original_file_sha256: 'a'.repeat(64),
      rows_received: 1,
      rows_accepted: 1,
      rows_rejected: 0,
      total_cost_usd: '107.00',
      created_by_account_id: '11111111-1111-4111-8111-111111111111',
      created_at: createdAt,
      completed_at: completedAt,
      error_detail: null,
    };
    const lineItemRow = {
      id: 'line-1',
      import_run_id: '55555555-5555-4555-8555-555555555555',
      team_id: '22222222-2222-4222-8222-222222222222',
      provider: 'aws',
      billing_period_start: new Date('2026-06-01T00:00:00.000Z'),
      billing_period_end: new Date('2026-06-30T00:00:00.000Z'),
      usage_start: usageStart,
      usage_end: usageEnd,
      service_name: 'AmazonEC2',
      sku_id: 'sku-compute',
      region: 'us-east-1',
      resource_id: 'i-demo',
      usage_quantity: '730.00',
      usage_unit: 'Hrs',
      cost_usd: '107.00',
      currency: 'USD',
      tags: { cost_center: 'engineering' },
      raw_payload: { lineItemId: 'cur-1' },
      line_item_hash: 'b'.repeat(64),
      matched_comparison_id: comparisonResult.comparisonId,
      matched_trace_key: 'aws:sku-compute:us-east-1:on-demand',
      created_at: createdAt,
    };
    const reconciliationRow = {
      id: '66666666-6666-4666-8666-666666666666',
      import_run_id: '55555555-5555-4555-8555-555555555555',
      comparison_id: comparisonResult.comparisonId,
      provider: 'aws',
      estimated_total_usd: '100.00',
      invoiced_total_usd: '107.00',
      variance_usd: '7.00',
      variance_percent: '7.00',
      status: 'variance-warning',
      evidence: {
        invoiceLineItemHashes: ['b'.repeat(64)],
      },
      created_at: completedAt,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            ...importRow,
            status: 'processing',
            rows_accepted: 0,
            rows_rejected: 0,
            total_cost_usd: '0.00',
            completed_at: null,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [lineItemRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [importRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [importRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [lineItemRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [reconciliationRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [reconciliationRow],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.createBillingImport({
        importInput: {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          rows: [],
        },
        originalFileSha256: 'a'.repeat(64),
        teamId: '22222222-2222-4222-8222-222222222222',
        createdByAccountId: '11111111-1111-4111-8111-111111111111',
        rows: [
          {
            serviceName: 'AmazonEC2',
            skuId: 'sku-compute',
            region: 'us-east-1',
            resourceId: 'i-demo',
            usageStart: usageStart.toISOString(),
            usageEnd: usageEnd.toISOString(),
            usageQuantity: 730,
            usageUnit: 'Hrs',
            costUsd: 107,
            currency: 'USD',
            tags: { cost_center: 'engineering' },
            rawPayload: { lineItemId: 'cur-1' },
            lineItemHash: 'b'.repeat(64),
          },
        ],
      }),
    ).resolves.toEqual({
      importRun: expect.objectContaining({
        id: '55555555-5555-4555-8555-555555555555',
        rowsAccepted: 1,
        totalCostUsd: 107,
      }),
      lineItems: [
        expect.objectContaining({
          serviceName: 'AmazonEC2',
          usageQuantity: 730,
          matchedTraceKey: 'aws:sku-compute:us-east-1:on-demand',
        }),
      ],
    });
    await expect(
      repository.getBillingImport('55555555-5555-4555-8555-555555555555'),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'aws',
        billingPeriodStart: '2026-06-01',
      }),
    );
    await expect(
      repository.listInvoiceLineItems('55555555-5555-4555-8555-555555555555'),
    ).resolves.toEqual([
      expect.objectContaining({
        lineItemHash: 'b'.repeat(64),
        tags: { cost_center: 'engineering' },
      }),
    ]);
    await expect(
      repository.saveInvoiceReconciliation({
        importRunId: '55555555-5555-4555-8555-555555555555',
        comparisonId: comparisonResult.comparisonId,
        provider: 'aws',
        estimatedTotalUsd: 100,
        invoicedTotalUsd: 107,
        varianceUsd: 7,
        variancePercent: 7,
        status: 'variance-warning',
        evidence: { invoiceLineItemHashes: ['b'.repeat(64)] },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'variance-warning',
        evidence: { invoiceLineItemHashes: ['b'.repeat(64)] },
      }),
    );
    await expect(
      repository.listInvoiceReconciliations('55555555-5555-4555-8555-555555555555'),
    ).resolves.toEqual([
      expect.objectContaining({
        varianceUsd: 7,
      }),
    ]);

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(5, 'COMMIT');
    expect(query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining('INSERT INTO invoice_reconciliation_results'),
      [
        '55555555-5555-4555-8555-555555555555',
        comparisonResult.comparisonId,
        'aws',
        100,
        107,
        7,
        7,
        'variance-warning',
        JSON.stringify({ invoiceLineItemHashes: ['b'.repeat(64)] }),
      ],
    );
  });

  it('rolls back transactional auth and billing writes and closes the pool', async () => {
    const authFailureQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(new Error('account insert failed'))
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const authRepository = createRepository(authFailureQuery);

    await expect(
      authRepository.createLocalAccountWithTeam({
        email: 'architect@example.com',
        externalSubjectHash: 'a'.repeat(64),
        passwordHash: 'scrypt:v1:hash',
        teamName: 'Architecture team',
        teamSlug: 'architecture-team',
      }),
    ).rejects.toThrow('account insert failed');
    expect(authFailureQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(authFailureQuery).toHaveBeenNthCalledWith(3, 'ROLLBACK');

    const invitationFailureQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const invitationRepository = createRepository(invitationFailureQuery);

    await expect(
      invitationRepository.acceptTeamInvitation({
        invitationId: '88888888-8888-4888-8888-888888888888',
        accountId: '11111111-1111-4111-8111-111111111111',
        acceptedAt: '2026-07-06T00:00:00.000Z',
      }),
    ).rejects.toThrow('Team invitation is no longer pending');
    expect(invitationFailureQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(invitationFailureQuery).toHaveBeenNthCalledWith(3, 'ROLLBACK');

    const billingFailureQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockRejectedValueOnce(new Error('billing insert failed'))
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const billingRepository = createRepository(billingFailureQuery);

    await expect(
      billingRepository.createBillingImport({
        importInput: {
          provider: 'aws',
          sourceType: 'aws-cur',
          billingPeriodStart: '2026-06-01',
          billingPeriodEnd: '2026-06-30',
          rows: [],
        },
        originalFileSha256: 'a'.repeat(64),
        rows: [],
      }),
    ).rejects.toThrow('billing insert failed');
    expect(billingFailureQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(billingFailureQuery).toHaveBeenNthCalledWith(3, 'ROLLBACK');

    const missingSessionRepository = createRepository(
      jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
    );
    await expect(
      missingSessionRepository.resolveSession('missing-token-hash', '2026-07-06T00:00:00.000Z'),
    ).resolves.toBeUndefined();

    const pool: PgPoolLike = {
      query: jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
      end: jest.fn(async () => undefined),
    };
    const repository = new ApiDatabaseRepository(configService, secretsReader, () => pool);

    await repository.getComparison(comparisonResult.comparisonId);
    await repository.onModuleDestroy();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

function createRepository(query: jest.Mock): ApiDatabaseRepository {
  const pool: PgPoolLike = {
    query,
    end: jest.fn(async () => undefined),
  };

  return new ApiDatabaseRepository(configService, secretsReader, () => pool);
}
