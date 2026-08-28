import { ConfigService } from '@nestjs/config';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { SecretsReader } from '../secrets/secrets.service';
import { ApiDatabaseRepository, PgPoolLike } from './api-database.repository';
import { ApiConflictError } from './api-errors';

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
      dataProvenance: 'live',
      usesNonLivePricing: false,
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

  it('never reports fresh-live when the served catalog is mock/seeded data', async () => {
    const repository = createRepository(
      jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              provider: 'aws',
              status: 'success',
              records_updated: 30,
              records_rejected: 0,
              records_skipped: 0,
              last_successful_run: new Date('2026-07-01T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              provider: 'aws',
              catalog_rows: '30',
              current_rate_rows: '18',
              latest_catalog_sync_at: new Date('2026-07-01T00:00:00.000Z'),
              latest_rate_sync_at: new Date('2026-07-01T00:00:00.000Z'),
              catalog_success_rows: '30',
              catalog_partial_rows: '0',
              catalog_failed_rows: '0',
              // All 30 rows are mock fixtures (fixture:// source_endpoint).
              mock_catalog_rows: '30',
              seeded_catalog_rows: '0',
              rate_success_rows: '18',
              rate_partial_rows: '0',
              rate_failed_rows: '0',
            },
          ],
          rowCount: 1,
        }),
    );

    const health = await repository.getDataHealth(new Date('2026-07-01T00:00:00.000Z'));

    // Timestamp recency alone would have said "fresh"; provenance must override.
    expect(health.dataProvenance).toBe('mock');
    expect(health.usesNonLivePricing).toBe(true);
    // Never "fresh" over non-live data (here also degraded because the other
    // providers have no data at all in this fixture).
    expect(health.overallStatus).not.toBe('fresh');
    expect(health.providers[0].provenance).toBe('mock');
    expect(health.providers[0].message).toMatch(/mock\/demo fixture pricing/i);
    expect(
      health.alerts.some(
        (alert) => alert.providerId === 'aws' && /not live provider pricing/i.test(alert.message),
      ),
    ).toBe(true);
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

  it('upserts external SSO accounts into a team and previews invitation tokens', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const expiresAt = new Date('2026-07-13T00:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            email: 'sso.user@example.com',
            display_name: 'SSO User',
            status: 'active',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            account_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            email: 'sso.user@example.com',
            display_name: 'SSO User',
            status: 'active',
            team_id: '22222222-2222-4222-8222-222222222222',
            team_name: 'Architecture team',
            role: 'member',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            team_id: '22222222-2222-4222-8222-222222222222',
            email: 'finops@example.com',
            role: 'member',
            status: 'pending',
            invited_by_account_id: '11111111-1111-4111-8111-111111111111',
            accepted_by_account_id: null,
            expires_at: expiresAt,
            created_at: createdAt,
            accepted_at: null,
            revoked_at: null,
          },
        ],
        rowCount: 1,
      });
    const repository = createRepository(query);

    await expect(
      repository.upsertExternalAccountForTeam({
        email: 'sso.user@example.com',
        displayName: 'SSO User',
        authProvider: 'oidc',
        externalSubjectHash: 'a'.repeat(64),
        teamId: '22222222-2222-4222-8222-222222222222',
        defaultRole: 'member',
      }),
    ).resolves.toEqual({
      accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'sso.user@example.com',
      displayName: 'SSO User',
      status: 'active',
      defaultTeam: {
        teamId: '22222222-2222-4222-8222-222222222222',
        teamName: 'Architecture team',
        role: 'member',
      },
    });
    await expect(repository.findInvitationByTokenHash('b'.repeat(64))).resolves.toEqual(
      expect.objectContaining({
        email: 'finops@example.com',
        role: 'member',
        status: 'pending',
      }),
    );

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(6, 'COMMIT');
  });

  it('switches the current session to another account team through membership proof', async () => {
    const expiresAt = new Date('2026-07-07T00:00:00.000Z');
    const query = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          session_id: '33333333-3333-4333-8333-333333333333',
          account_id: '11111111-1111-4111-8111-111111111111',
          email: '',
          display_name: null,
          team_id: '55555555-5555-4555-8555-555555555555',
          team_name: 'Platform team',
          role: 'admin',
          expires_at: expiresAt,
        },
      ],
      rowCount: 1,
    });
    const repository = createRepository(query);

    await expect(
      repository.updateSessionTeam({
        sessionId: '33333333-3333-4333-8333-333333333333',
        accountId: '11111111-1111-4111-8111-111111111111',
        teamId: '55555555-5555-4555-8555-555555555555',
        now: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      activeTeam: {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Platform team',
        role: 'admin',
      },
      session: {
        id: '33333333-3333-4333-8333-333333333333',
        expiresAt: expiresAt.toISOString(),
      },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE account_sessions'), [
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111111',
      '55555555-5555-4555-8555-555555555555',
      '2026-07-06T00:00:00.000Z',
    ]);

    const missingRepository = createRepository(
      jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
    );
    await expect(
      missingRepository.updateSessionTeam({
        sessionId: '33333333-3333-4333-8333-333333333333',
        accountId: '11111111-1111-4111-8111-111111111111',
        teamId: '99999999-9999-4999-8999-999999999999',
        now: '2026-07-06T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
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
    const query = jest.fn(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('INSERT INTO team_audit_events')) {
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              team_id: '22222222-2222-4222-8222-222222222222',
              actor_account_id: '11111111-1111-4111-8111-111111111111',
              actor_email: null,
              action: 'team.invitation.created',
              target_type: 'invitation',
              target_id: '88888888-8888-4888-8888-888888888888',
              metadata: {},
              created_at: createdAt,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('SELECT accounts.id AS account_id')) {
        return {
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
        };
      }

      if (text.includes('INSERT INTO team_invitations')) {
        return { rows: [pendingInvitation], rowCount: 1 };
      }

      if (text.includes('FROM team_invitations') && text.includes('ORDER BY created_at DESC')) {
        return {
          rows: [
            {
              ...pendingInvitation,
              status: 'expired',
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('UPDATE team_invitations') && text.includes('token_hash = $3')) {
        return { rows: [pendingInvitation], rowCount: 1 };
      }

      if (text.includes('WHERE token_hash = $1')) {
        return { rows: [pendingInvitation], rowCount: 1 };
      }

      if (text.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              ...pendingInvitation,
              token_hash: 'e'.repeat(64),
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('INSERT INTO team_memberships')) {
        return { rows: [], rowCount: 1 };
      }

      if (text.includes("SET status = 'accepted'")) {
        return {
          rows: [
            {
              ...pendingInvitation,
              status: 'accepted',
              accepted_by_account_id: '11111111-1111-4111-8111-111111111111',
              accepted_at: acceptedAt,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('COUNT(*) AS owners')) {
        return { rows: [{ owners: '2' }], rowCount: 1 };
      }

      if (text.includes('UPDATE team_memberships')) {
        return {
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
        };
      }

      if (text.includes('DELETE FROM team_memberships')) {
        return {
          rows: [
            {
              account_id: '11111111-1111-4111-8111-111111111111',
              role: 'admin',
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('FROM sso_identity_provider_configs')) {
        return {
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
        };
      }

      throw new Error(`Unhandled query in team repository spec: ${text}`);
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
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'team.invitation.created',
          targetType: 'invitation',
          metadata: {
            email: 'finops@example.com',
            role: 'admin',
          },
        },
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
      repository.resendTeamInvitation({
        teamId: '22222222-2222-4222-8222-222222222222',
        invitationId: '88888888-8888-4888-8888-888888888888',
        tokenHash: 'f'.repeat(64),
        invitedByAccountId: '11111111-1111-4111-8111-111111111111',
        expiresAt: expiresAt.toISOString(),
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'team.invitation.resent',
          targetType: 'invitation',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '88888888-8888-4888-8888-888888888888',
        status: 'pending',
      }),
    );
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
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'team.member.role_updated',
          targetType: 'member',
        },
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
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'team.member.removed',
          targetType: 'member',
        },
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

    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE team_invitations'), [
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      'f'.repeat(64),
      '11111111-1111-4111-8111-111111111111',
      expiresAt.toISOString(),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO team_audit_events'), [
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'team.invitation.created',
      'invitation',
      '88888888-8888-4888-8888-888888888888',
      JSON.stringify({
        email: 'finops@example.com',
        role: 'admin',
        status: 'pending',
      }),
    ]);
    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
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
      evidence_hash: 'e'.repeat(32),
      created_at: completedAt,
    };
    let legalHoldState = false;
    let providerRetentionProofRow: Record<string, unknown> = {
      provider_retention_proof_status: null,
      provider_retention_proof_evidence_source: null,
      provider_retention_proof_checked_at: null,
      provider_retention_proof_retention_mode: null,
      provider_retention_proof_reference: null,
      provider_retention_proof_sha256: null,
      provider_retention_proof_caveats: [],
    };
    const blobRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reconciliation_id: '66666666-6666-4666-8666-666666666666',
      artifact_id: 'artifact-1',
      team_id: '22222222-2222-4222-8222-222222222222',
      file_name: 'aws-invoice-control.txt',
      mime_type: 'text/plain',
      content_sha256: 'd'.repeat(64),
      content_size_bytes: 7,
      content: Buffer.from('invoice'),
      uploaded_by_account_id: '11111111-1111-4111-8111-111111111111',
      uploaded_at: completedAt,
      storage_backend: 'database-bytea',
      kms_key_reference: null,
      retention_until: new Date('2027-07-06T00:00:02.000Z'),
      legal_hold: false,
      malware_scan_status: 'passed',
      malware_scan_engine: 'polycost-eicar-signature-v1',
      malware_scan_checked_at: completedAt,
      malware_scan_finding: null,
      object_store_bucket: null,
      object_store_region: null,
      object_store_key: null,
      object_store_uri: null,
      object_store_etag: null,
      object_store_version: null,
      ...providerRetentionProofRow,
    };
    const query = jest.fn(async (text: string, values?: unknown[]) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('INSERT INTO team_audit_events')) {
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              team_id: '22222222-2222-4222-8222-222222222222',
              actor_account_id: '11111111-1111-4111-8111-111111111111',
              actor_email: null,
              action: 'billing.import.created',
              target_type: 'billing_import',
              target_id: '55555555-5555-4555-8555-555555555555',
              metadata: {},
              created_at: completedAt,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('INSERT INTO billing_import_runs')) {
        return {
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
        };
      }

      if (text.includes('INSERT INTO invoice_line_items')) {
        return { rows: [lineItemRow], rowCount: 1 };
      }

      if (text.includes('UPDATE billing_import_runs')) {
        return { rows: [importRow], rowCount: 1 };
      }

      if (text.includes('FROM billing_import_runs')) {
        return { rows: [importRow], rowCount: 1 };
      }

      if (text.includes('FROM invoice_line_items')) {
        return { rows: [lineItemRow], rowCount: 1 };
      }

      if (text.includes('INSERT INTO invoice_reconciliation_results')) {
        return { rows: [reconciliationRow], rowCount: 1 };
      }

      if (text.includes('INSERT INTO invoice_artifact_blobs')) {
        legalHoldState = Boolean(values?.[13]);
        providerRetentionProofRow = {
          provider_retention_proof_status: values?.[22] ?? null,
          provider_retention_proof_evidence_source: values?.[23] ?? null,
          provider_retention_proof_checked_at: values?.[24] ?? null,
          provider_retention_proof_retention_mode: values?.[25] ?? null,
          provider_retention_proof_reference: values?.[26] ?? null,
          provider_retention_proof_sha256: values?.[27] ?? null,
          provider_retention_proof_caveats:
            typeof values?.[28] === 'string' ? JSON.parse(values[28]) : [],
        };

        return { rows: [blobRow], rowCount: 1 };
      }

      if (text.includes('UPDATE invoice_artifact_blobs')) {
        if (text.includes('provider_retention_proof_status')) {
          providerRetentionProofRow = {
            provider_retention_proof_status: values?.[2] ?? null,
            provider_retention_proof_evidence_source: values?.[3] ?? null,
            provider_retention_proof_checked_at: values?.[4] ?? null,
            provider_retention_proof_retention_mode: values?.[5] ?? null,
            provider_retention_proof_reference: values?.[6] ?? null,
            provider_retention_proof_sha256: values?.[7] ?? null,
            provider_retention_proof_caveats:
              typeof values?.[8] === 'string' ? JSON.parse(values[8]) : [],
          };
        } else {
          legalHoldState = Boolean(values?.[2]);
        }

        return { rows: [{ id: blobRow.id }], rowCount: 1 };
      }

      if (text.includes('FROM invoice_artifact_blobs')) {
        return {
          rows: [{ ...blobRow, ...providerRetentionProofRow, legal_hold: legalHoldState }],
          rowCount: 1,
        };
      }

      if (text.includes('UPDATE invoice_reconciliation_results')) {
        const evidence =
          typeof values?.[1] === 'string'
            ? (JSON.parse(values[1]) as Record<string, unknown>)
            : {
                invoiceLineItemHashes: ['b'.repeat(64)],
                invoiceGradeArtifactRegister: {
                  registeredCount: 1,
                  status: 'metadata-registered-not-verified',
                },
              };
        return {
          rows: [
            {
              ...reconciliationRow,
              evidence,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('FROM invoice_reconciliation_results')) {
        return { rows: [reconciliationRow], rowCount: 1 };
      }

      throw new Error(`Unhandled query in billing repository spec: ${text}`);
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
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.import.created',
          targetType: 'billing_import',
        },
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
        audit: {
          teamId: '22222222-2222-4222-8222-222222222222',
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.reconciliation.created',
          targetType: 'billing_reconciliation',
        },
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
    await expect(
      repository.getInvoiceReconciliation('66666666-6666-4666-8666-666666666666'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '66666666-6666-4666-8666-666666666666',
        provider: 'aws',
      }),
    );
    await expect(
      repository.updateInvoiceReconciliationEvidence({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        expectedEvidenceHash: 'e'.repeat(32),
        evidence: {
          invoiceLineItemHashes: ['b'.repeat(64)],
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            status: 'metadata-registered-not-verified',
          },
        },
        audit: {
          teamId: '22222222-2222-4222-8222-222222222222',
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.reconciliation.artifact_registered',
          targetType: 'billing_reconciliation',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          invoiceGradeArtifactRegister: expect.objectContaining({
            registeredCount: 1,
          }),
        }),
      }),
    );
    await expect(
      repository.saveInvoiceArtifactBlobAndUpdateEvidence({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        expectedEvidenceHash: 'e'.repeat(32),
        artifactId: 'artifact-1',
        teamId: '22222222-2222-4222-8222-222222222222',
        fileName: 'aws-invoice-control.txt',
        mimeType: 'text/plain',
        contentSha256: 'd'.repeat(64),
        contentSizeBytes: 7,
        storageBackend: 'database-bytea',
        content: Buffer.from('invoice'),
        uploadedByAccountId: '11111111-1111-4111-8111-111111111111',
        uploadedAt: completedAt.toISOString(),
        retentionUntil: '2027-07-06T00:00:02.000Z',
        legalHold: false,
        malwareScanCheckedAt: completedAt.toISOString(),
        evidence: {
          invoiceLineItemHashes: ['b'.repeat(64)],
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            artifacts: [
              {
                id: 'artifact-1',
                storedBlob: {
                  storageStatus: 'stored',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 7,
                },
              },
            ],
          },
        },
        audit: {
          teamId: '22222222-2222-4222-8222-222222222222',
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.reconciliation.artifact_blob_uploaded',
          targetType: 'billing_reconciliation',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          invoiceGradeArtifactRegister: expect.objectContaining({
            artifacts: [
              expect.objectContaining({
                id: 'artifact-1',
              }),
            ],
          }),
        }),
      }),
    );
    await expect(
      repository.getInvoiceArtifactBlob('66666666-6666-4666-8666-666666666666', 'artifact-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        fileName: 'aws-invoice-control.txt',
        contentSha256: 'd'.repeat(64),
        contentBase64: Buffer.from('invoice').toString('base64'),
        storageProfile: expect.objectContaining({
          storageBackend: 'database-bytea',
          encryptionStatus: 'database-managed',
          kmsKeyRequiredForProduction: true,
        }),
        retentionPolicy: expect.objectContaining({
          retentionUntil: '2027-07-06T00:00:02.000Z',
          retentionDays: 365,
          legalHold: false,
        }),
        malwareScan: expect.objectContaining({
          status: 'passed',
          scanner: 'polycost-eicar-signature-v1',
          checkedAt: completedAt.toISOString(),
          findings: [],
        }),
      }),
    );
    await expect(
      repository.updateInvoiceArtifactLegalHoldAndEvidence({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        expectedEvidenceHash: 'e'.repeat(32),
        artifactId: 'artifact-1',
        legalHold: true,
        evidence: {
          invoiceLineItemHashes: ['b'.repeat(64)],
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            artifacts: [
              {
                id: 'artifact-1',
                storedBlob: {
                  storageStatus: 'stored',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 7,
                  governance: {
                    retentionPolicy: {
                      retentionUntil: '2027-07-06T00:00:02.000Z',
                      retentionDays: 365,
                      legalHold: true,
                    },
                  },
                },
              },
            ],
          },
        },
        audit: {
          teamId: '22222222-2222-4222-8222-222222222222',
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.reconciliation.artifact_legal_hold_updated',
          targetType: 'billing_reconciliation',
          metadata: {
            artifactId: 'artifact-1',
            legalHold: true,
            reason: 'retention review',
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          invoiceGradeArtifactRegister: expect.objectContaining({
            artifacts: [
              expect.objectContaining({
                id: 'artifact-1',
                storedBlob: expect.objectContaining({
                  governance: expect.objectContaining({
                    retentionPolicy: expect.objectContaining({
                      legalHold: true,
                    }),
                  }),
                }),
              }),
            ],
          }),
        }),
      }),
    );
    await expect(
      repository.getInvoiceArtifactBlob('66666666-6666-4666-8666-666666666666', 'artifact-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        retentionPolicy: expect.objectContaining({
          legalHold: true,
        }),
      }),
    );

    expect(query).toHaveBeenCalledWith('BEGIN');
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query).toHaveBeenCalledWith(
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO team_audit_events'), [
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'billing.import.created',
      'billing_import',
      '55555555-5555-4555-8555-555555555555',
      JSON.stringify({
        provider: 'aws',
        sourceType: 'aws-cur',
        rowsAccepted: 1,
        rowsRejected: 0,
        totalCostUsd: 107,
      }),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO invoice_artifact_blobs'),
      [
        '66666666-6666-4666-8666-666666666666',
        'artifact-1',
        '22222222-2222-4222-8222-222222222222',
        'aws-invoice-control.txt',
        'text/plain',
        'd'.repeat(64),
        7,
        Buffer.from('invoice'),
        '11111111-1111-4111-8111-111111111111',
        completedAt.toISOString(),
        'database-bytea',
        null,
        '2027-07-06T00:00:02.000Z',
        false,
        completedAt.toISOString(),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        '[]',
      ],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE invoice_artifact_blobs'), [
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      true,
    ]);
    await expect(
      repository.updateInvoiceArtifactProviderRetentionProofAndEvidence({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        expectedEvidenceHash: 'e'.repeat(32),
        artifactId: 'artifact-1',
        providerRetentionProof: {
          schemaVersion: 'invoice-artifact-provider-retention-proof/v1',
          status: 'provider-verified',
          evidenceSource: 'provider-control-plane',
          storageBackend: 'aws-s3',
          checkedAt: '2026-07-06T01:00:00.000Z',
          retentionMode: 'provider-object-lock',
          retentionUntil: '2027-07-06T00:00:02.000Z',
          legalHold: true,
          proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
          proofDigestSha256: 'f'.repeat(64),
          caveats: ['captured from AWS S3 Object Lock control plane'],
        },
        evidence: {
          invoiceLineItemHashes: ['b'.repeat(64)],
          invoiceGradeArtifactRegister: {
            registeredCount: 1,
            artifacts: [
              {
                id: 'artifact-1',
                storedBlob: {
                  storageStatus: 'stored',
                  contentSha256: 'd'.repeat(64),
                  contentSizeBytes: 7,
                  governance: {
                    providerRetentionProof: {
                      status: 'provider-verified',
                    },
                  },
                },
              },
            ],
          },
        },
        audit: {
          teamId: '22222222-2222-4222-8222-222222222222',
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'billing.reconciliation.artifact_provider_retention_proof_attached',
          targetType: 'billing_reconciliation',
          metadata: {
            artifactId: 'artifact-1',
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          invoiceGradeArtifactRegister: expect.objectContaining({
            artifacts: [
              expect.objectContaining({
                id: 'artifact-1',
                storedBlob: expect.objectContaining({
                  governance: expect.objectContaining({
                    providerRetentionProof: expect.objectContaining({
                      status: 'provider-verified',
                    }),
                  }),
                }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('provider_retention_proof_status'), [
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
      'provider-verified',
      'provider-control-plane',
      '2026-07-06T01:00:00.000Z',
      'provider-object-lock',
      's3://polycost-invoice-artifacts/object-lock-proof.json',
      'f'.repeat(64),
      JSON.stringify(['captured from AWS S3 Object Lock control plane']),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO team_audit_events'),
      expect.arrayContaining([
        'billing.reconciliation.artifact_legal_hold_updated',
        'billing_reconciliation',
        '66666666-6666-4666-8666-666666666666',
      ]),
    );
  });

  it('summarizes and deletes expired invoice artifact blobs without touching legal holds', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            expired_candidates: '2',
            legal_hold_skipped: '1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'artifact-blob-1' }, { id: 'artifact-blob-2' }],
      });
    const repository = createRepository(query);
    const evaluatedAt = '2026-07-08T00:00:00.000Z';
    const teamId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    await expect(
      repository.summarizeInvoiceArtifactRetention(evaluatedAt, teamId),
    ).resolves.toEqual({
      expiredCandidates: 2,
      legalHoldSkipped: 1,
    });
    await expect(repository.deleteExpiredInvoiceArtifactBlobs(evaluatedAt)).resolves.toBe(2);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('COUNT(*) FILTER'), [
      evaluatedAt,
      teamId,
    ]);
    // Summary is scoped to the caller's team (SEC-2).
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('team_id = $2'), [
      evaluatedAt,
      teamId,
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM invoice_artifact_blobs'),
      [evaluatedAt],
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('legal_hold = false'), [
      evaluatedAt,
    ]);
  });

  it('lists expired invoice artifact deletion candidates and deletes eligible ids only', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            storage_backend: 'aws-s3',
            object_store_bucket: 'polycost-invoice-artifacts',
            object_store_region: 'us-east-1',
            object_store_key: 'invoice-artifacts/team/reconciliation/artifact.txt',
            object_store_uri:
              's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
            object_store_version: 'v1',
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            storage_backend: 'database-bytea',
            object_store_bucket: null,
            object_store_region: null,
            object_store_key: null,
            object_store_uri: null,
            object_store_version: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        ],
      });
    const repository = createRepository(query);
    const evaluatedAt = '2026-07-08T00:00:00.000Z';
    const teamId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];

    await expect(
      repository.listExpiredInvoiceArtifactBlobDeletionCandidates(evaluatedAt, teamId),
    ).resolves.toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        storageBackend: 'aws-s3',
        objectStoreBucket: 'polycost-invoice-artifacts',
        objectStoreRegion: 'us-east-1',
        objectStoreKey: 'invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreUri:
          's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
        objectStoreVersion: 'v1',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        storageBackend: 'database-bytea',
      },
    ]);
    await expect(
      repository.deleteInvoiceArtifactBlobsByIds(ids, evaluatedAt, teamId),
    ).resolves.toBe(2);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM invoice_artifact_blobs'),
      [evaluatedAt, teamId],
    );
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('ORDER BY retention_until ASC'),
      [evaluatedAt, teamId],
    );
    // The DELETE itself is team-scoped, so cross-tenant ids can never be removed (SEC-2).
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('AND team_id = $3::uuid'), [
      ids,
      evaluatedAt,
      teamId,
    ]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('legal_hold = false'), [
      ids,
      evaluatedAt,
      teamId,
    ]);
  });

  it('maps externally stored invoice artifact blob pointers without inline bytes', async () => {
    const uploadedAt = new Date('2026-07-08T00:00:00.000Z');
    const query = jest.fn(async () => ({
      rows: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          reconciliation_id: '66666666-6666-4666-8666-666666666666',
          artifact_id: 'artifact-1',
          team_id: '22222222-2222-4222-8222-222222222222',
          file_name: 'aws-invoice-control.txt',
          mime_type: 'text/plain',
          content_sha256: 'd'.repeat(64),
          content_size_bytes: 7,
          content: null,
          uploaded_by_account_id: '11111111-1111-4111-8111-111111111111',
          uploaded_at: uploadedAt,
          storage_backend: 'aws-s3',
          kms_key_reference: 'arn:aws:kms:us-east-1:111122223333:key/demo',
          retention_until: new Date('2027-07-08T00:00:00.000Z'),
          legal_hold: false,
          malware_scan_status: 'passed',
          malware_scan_engine: 'polycost-http-webhook-scanner',
          malware_scan_checked_at: uploadedAt,
          malware_scan_finding: null,
          object_store_bucket: 'polycost-invoice-artifacts',
          object_store_region: 'us-east-1',
          object_store_key: 'invoice-artifacts/team/reconciliation/artifact.txt',
          object_store_uri:
            's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
          object_store_etag: '"etag"',
          object_store_version: 'v1',
          provider_retention_proof_status: 'provider-verified',
          provider_retention_proof_evidence_source: 'provider-control-plane',
          provider_retention_proof_checked_at: new Date('2026-07-08T01:00:00.000Z'),
          provider_retention_proof_retention_mode: 'provider-object-lock',
          provider_retention_proof_reference:
            's3://polycost-invoice-artifacts/object-lock-proof.json',
          provider_retention_proof_sha256: 'f'.repeat(64),
          provider_retention_proof_caveats: ['captured from AWS S3 Object Lock control plane'],
        },
      ],
    }));
    const repository = createRepository(query);

    const blob = await repository.getInvoiceArtifactBlob(
      '66666666-6666-4666-8666-666666666666',
      'artifact-1',
    );

    expect(blob?.contentBase64).toBeUndefined();
    expect(blob).toMatchObject({
      storageProfile: {
        storageBackend: 'aws-s3',
        encryptionStatus: 'customer-managed-kms',
        kmsKeyRequiredForProduction: false,
        objectStore: {
          bucketOrContainer: 'polycost-invoice-artifacts',
          region: 'us-east-1',
          key: 'invoice-artifacts/team/reconciliation/artifact.txt',
          uri: 's3://polycost-invoice-artifacts/invoice-artifacts/team/reconciliation/artifact.txt',
          eTag: '"etag"',
          version: 'v1',
        },
      },
      providerRetentionProof: {
        status: 'provider-verified',
        evidenceSource: 'provider-control-plane',
        checkedAt: '2026-07-08T01:00:00.000Z',
        retentionMode: 'provider-object-lock',
        proofReference: 's3://polycost-invoice-artifacts/object-lock-proof.json',
        proofDigestSha256: 'f'.repeat(64),
        caveats: ['captured from AWS S3 Object Lock control plane'],
      },
    });
  });

  it('records and lists team audit events with actor display context', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const auditRow = (actorEmail: string | null) => ({
      id: '99999999-9999-4999-8999-999999999999',
      team_id: '22222222-2222-4222-8222-222222222222',
      actor_account_id: '11111111-1111-4111-8111-111111111111',
      actor_email: actorEmail,
      action: 'team.invitation.created',
      target_type: 'invitation',
      target_id: '88888888-8888-4888-8888-888888888888',
      metadata: {
        email: 'finops@example.com',
        role: 'member',
      },
      created_at: createdAt,
    });
    // Route by SQL text so the assertions are robust to the BEGIN/COMMIT that now
    // wrap the standalone recordTeamAuditEvent path (DB-3: event + outbox must be
    // atomic).
    const query = jest.fn(async (text: string) => {
      if (text.includes('INSERT INTO team_audit_events')) {
        return { rows: [auditRow(null)], rowCount: 1 };
      }
      if (text.includes('FROM team_audit_events')) {
        return { rows: [auditRow('architect@example.com')], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = createRepository(query);

    await expect(
      repository.recordTeamAuditEvent({
        teamId: '22222222-2222-4222-8222-222222222222',
        actorAccountId: '11111111-1111-4111-8111-111111111111',
        action: 'team.invitation.created',
        targetType: 'invitation',
        targetId: '88888888-8888-4888-8888-888888888888',
        metadata: {
          email: 'finops@example.com',
          role: 'member',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '99999999-9999-4999-8999-999999999999',
        action: 'team.invitation.created',
        createdAt: createdAt.toISOString(),
      }),
    );
    await expect(
      repository.listTeamAuditEvents('22222222-2222-4222-8222-222222222222', 500),
    ).resolves.toEqual([
      expect.objectContaining({
        actorEmail: 'architect@example.com',
        targetType: 'invitation',
      }),
    ]);

    // The standalone audit write is wrapped in a transaction (BEGIN before the
    // insert, COMMIT after, no ROLLBACK on the happy path).
    const texts = query.mock.calls.map(([text]) => String(text));
    expect(texts[0]).toBe('BEGIN');
    expect(texts.some((text) => text.includes('COMMIT'))).toBe(true);
    expect(texts.some((text) => text.includes('ROLLBACK'))).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO team_audit_events'), [
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'team.invitation.created',
      'invitation',
      '88888888-8888-4888-8888-888888888888',
      JSON.stringify({
        email: 'finops@example.com',
        role: 'member',
      }),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM team_audit_events'), [
      '22222222-2222-4222-8222-222222222222',
      100,
    ]);
  });

  it('enqueues the audit export outbox atomically with the event on the standalone path (DB-3)', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const query = jest.fn(async (text: string) => {
      if (text.includes('INSERT INTO team_audit_events')) {
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              team_id: '22222222-2222-4222-8222-222222222222',
              actor_account_id: null,
              actor_email: null,
              action: 'team.invitation.created',
              target_type: 'invitation',
              target_id: null,
              metadata: {},
              created_at: createdAt,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = {
      query,
      end: jest.fn(async () => undefined),
    } as unknown as PgPoolLike;
    const repository = new ApiDatabaseRepository(
      configServiceWith({ AUTH_AUDIT_EXPORT_MODE: 'webhook' }),
      secretsReader,
      () => pool,
    );

    await repository.recordTeamAuditEvent({
      teamId: '22222222-2222-4222-8222-222222222222',
      action: 'team.invitation.created',
      targetType: 'invitation',
    });

    const texts = query.mock.calls.map(([text]) => String(text));
    const eventIndex = texts.findIndex((text) => text.includes('INSERT INTO team_audit_events'));
    const outboxIndex = texts.findIndex((text) =>
      text.includes('INSERT INTO team_audit_event_exports'),
    );
    const commitIndex = texts.findIndex((text) => text.includes('COMMIT'));

    // BEGIN → event insert → outbox enqueue → COMMIT: the compliance event and
    // its delivery outbox row commit as one unit, so there can be no
    // logged-but-never-exported event.
    expect(texts[0]).toBe('BEGIN');
    expect(eventIndex).toBeGreaterThan(0);
    expect(outboxIndex).toBeGreaterThan(eventIndex);
    expect(commitIndex).toBeGreaterThan(outboxIndex);
    expect(texts.some((text) => text.includes('ROLLBACK'))).toBe(false);
  });

  it('uses a checked-out database client for transaction-coupled audit writes', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const expiresAt = new Date('2026-07-13T00:00:00.000Z');
    const invitationRow = {
      id: '88888888-8888-4888-8888-888888888888',
      team_id: '22222222-2222-4222-8222-222222222222',
      email: 'finops@example.com',
      role: 'member',
      status: 'pending',
      invited_by_account_id: '11111111-1111-4111-8111-111111111111',
      accepted_by_account_id: null,
      expires_at: expiresAt,
      created_at: createdAt,
      accepted_at: null,
      revoked_at: null,
    };
    const clientQuery = jest.fn(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (text.includes('INSERT INTO team_invitations')) {
        return { rows: [invitationRow], rowCount: 1 };
      }

      if (text.includes('INSERT INTO team_audit_events')) {
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              team_id: '22222222-2222-4222-8222-222222222222',
              actor_account_id: '11111111-1111-4111-8111-111111111111',
              actor_email: null,
              action: 'team.invitation.created',
              target_type: 'invitation',
              target_id: '88888888-8888-4888-8888-888888888888',
              metadata: {},
              created_at: createdAt,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes('INSERT INTO team_audit_event_exports')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected transactional query: ${text}`);
    });
    const client = {
      query: clientQuery,
      release: jest.fn(),
    };
    const poolQuery = jest.fn(async () => ({
      rows: [],
      rowCount: 0,
    }));
    const connect = jest.fn(async () => client);
    const pool = {
      query: poolQuery,
      connect,
      end: jest.fn(async () => undefined),
    } as unknown as PgPoolLike;
    const repository = new ApiDatabaseRepository(
      configServiceWith({ AUTH_AUDIT_EXPORT_MODE: 'webhook' }),
      secretsReader,
      () => pool,
    );

    await expect(
      repository.createTeamInvitation({
        teamId: '22222222-2222-4222-8222-222222222222',
        email: 'finops@example.com',
        role: 'member',
        tokenHash: 'e'.repeat(64),
        invitedByAccountId: '11111111-1111-4111-8111-111111111111',
        expiresAt: expiresAt.toISOString(),
        audit: {
          actorAccountId: '11111111-1111-4111-8111-111111111111',
          action: 'team.invitation.created',
          targetType: 'invitation',
          targetId: '88888888-8888-4888-8888-888888888888',
          metadata: {
            email: 'finops@example.com',
            role: 'member',
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: '88888888-8888-4888-8888-888888888888',
        status: 'pending',
      }),
    );

    expect(connect).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(clientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO team_invitations'),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO team_audit_events'),
      [
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'team.invitation.created',
        'invitation',
        '88888888-8888-4888-8888-888888888888',
        JSON.stringify({
          email: 'finops@example.com',
          role: 'member',
          status: 'pending',
        }),
      ],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO team_audit_event_exports'),
      ['99999999-9999-4999-8999-999999999999'],
    );
    expect(clientQuery).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releases checked-out database clients when transaction start fails', async () => {
    const clientQuery = jest.fn(async (text: string) => {
      if (text === 'BEGIN') {
        throw new Error('begin failed');
      }

      return { rows: [], rowCount: 0 };
    });
    const client = {
      query: clientQuery,
      release: jest.fn(),
    };
    const pool = {
      query: jest.fn(async () => ({
        rows: [],
        rowCount: 0,
      })),
      connect: jest.fn(async () => client),
      end: jest.fn(async () => undefined),
    } as unknown as PgPoolLike;
    const repository = new ApiDatabaseRepository(configService, secretsReader, () => pool);

    await expect(
      repository.createTeamInvitation({
        teamId: '22222222-2222-4222-8222-222222222222',
        email: 'finops@example.com',
        role: 'member',
        tokenHash: 'e'.repeat(64),
        invitedByAccountId: '11111111-1111-4111-8111-111111111111',
        expiresAt: '2026-07-13T00:00:00.000Z',
      }),
    ).rejects.toThrow('begin failed');

    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery).not.toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('claims and updates team audit export outbox rows', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const attemptedAt = new Date('2026-07-06T00:05:00.000Z');
    const query = jest.fn(async (text: string) => {
      if (text.includes('WITH selected_exports')) {
        return {
          rows: [
            {
              export_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              audit_event_id: '99999999-9999-4999-8999-999999999999',
              destination: 'webhook',
              export_status: 'processing',
              attempts: 1,
              next_attempt_at: attemptedAt,
              last_attempt_at: attemptedAt,
              delivered_at: null,
              last_error: null,
              export_created_at: createdAt,
              export_updated_at: attemptedAt,
              id: '99999999-9999-4999-8999-999999999999',
              team_id: '22222222-2222-4222-8222-222222222222',
              actor_account_id: '11111111-1111-4111-8111-111111111111',
              actor_email: 'architect@example.com',
              action: 'team.invitation.created',
              target_type: 'invitation',
              target_id: '88888888-8888-4888-8888-888888888888',
              metadata: {
                email: 'finops@example.com',
                role: 'member',
              },
              created_at: createdAt,
            },
          ],
          rowCount: 1,
        };
      }

      if (text.includes("SET status = 'delivered'")) {
        return { rows: [], rowCount: 1 };
      }

      if (text.includes('RETURNING status')) {
        return { rows: [{ status: 'pending' }], rowCount: 1 };
      }

      throw new Error(`Unhandled export outbox query: ${text}`);
    });
    const repository = createRepository(query);

    await expect(
      repository.claimPendingTeamAuditExports({
        now: attemptedAt.toISOString(),
        limit: 1000,
        maxAttempts: 5,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        auditEventId: '99999999-9999-4999-8999-999999999999',
        destination: 'webhook',
        status: 'processing',
        attempts: 1,
        auditEvent: expect.objectContaining({
          id: '99999999-9999-4999-8999-999999999999',
          actorEmail: 'architect@example.com',
          action: 'team.invitation.created',
        }),
      }),
    ]);
    await repository.markTeamAuditExportDelivered({
      exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deliveredAt: attemptedAt.toISOString(),
    });
    await expect(
      repository.markTeamAuditExportFailed({
        exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        error: 'webhook unavailable',
        nextAttemptAt: '2026-07-06T00:10:00.000Z',
        maxAttempts: 5,
      }),
    ).resolves.toBe('pending');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WITH selected_exports'), [
      attemptedAt.toISOString(),
      5,
      500,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'delivered'"), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      attemptedAt.toISOString(),
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('last_error = left($2, 500)'), [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'webhook unavailable',
      '2026-07-06T00:10:00.000Z',
      5,
    ]);
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

  it('guards invoice evidence writes with an optimistic-hash check and raises a conflict on mismatch', async () => {
    const query = jest.fn(async (text: string) => {
      if (
        text.includes('BEGIN') ||
        text.includes('COMMIT') ||
        text.includes('ROLLBACK') ||
        text.includes('INSERT INTO team_audit_events')
      ) {
        return { rows: [], rowCount: 0 };
      }
      // Concurrent writer already advanced the evidence, so the md5 guard in the
      // WHERE clause matches no row.
      if (text.includes('UPDATE invoice_reconciliation_results')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = createRepository(query);

    await expect(
      repository.updateInvoiceReconciliationEvidence({
        reconciliationId: '66666666-6666-4666-8666-666666666666',
        evidence: { invoiceLineItemHashes: ['b'.repeat(64)] },
        expectedEvidenceHash: 'stale-hash-value',
      }),
    ).rejects.toBeInstanceOf(ApiConflictError);

    const updateCall = query.mock.calls.find(([text]) =>
      String(text).includes('UPDATE invoice_reconciliation_results'),
    ) as unknown as [string, unknown[]] | undefined;
    expect(updateCall).toBeDefined();
    // The optimistic guard is present in the SQL and the caller-supplied hash is
    // bound as the third parameter.
    expect(String(updateCall?.[0])).toContain('md5(evidence::text) = $3');
    expect((updateCall?.[1] as unknown[])?.[2]).toBe('stale-hash-value');
    // A failed evidence write must roll the transaction back rather than commit.
    expect(query.mock.calls.some(([text]) => String(text).includes('ROLLBACK'))).toBe(true);
    expect(query.mock.calls.some(([text]) => String(text).includes('COMMIT'))).toBe(false);
  });

  it('persists a comparison and its audit log atomically in one transaction (DB-3)', async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = createRepository(query);

    await repository.saveComparisonWithAuditLog(
      nwsSnapshot as never,
      {
        comparisonId: '11111111-1111-4111-8111-111111111111',
        pricingAsOf: '2026-06-29T00:00:00.000Z',
        cheapestProviderId: 'aws',
        providers: [
          {
            providerId: 'aws',
            lineItems: [
              {
                category: 'compute',
                description: 'Compute',
                baseMonthlyCostUsd: 10,
                isApproximate: false,
              },
            ],
          },
        ],
      } as never,
    );

    const texts = (query.mock.calls as unknown as Array<[string]>).map(([text]) => String(text));
    const comparisonIndex = texts.findIndex((text) => text.includes('INSERT INTO comparisons'));
    const auditIndex = texts.findIndex((text) =>
      text.includes('INSERT INTO comparison_audit_logs'),
    );
    const commitIndex = texts.findIndex((text) => text.includes('COMMIT'));

    // BEGIN → comparison insert → audit-log insert → COMMIT: a saved comparison
    // can never be missing its rate-level audit trail.
    expect(texts[0]).toBe('BEGIN');
    expect(comparisonIndex).toBeGreaterThan(0);
    expect(auditIndex).toBeGreaterThan(comparisonIndex);
    expect(commitIndex).toBeGreaterThan(auditIndex);
    expect(texts.some((text) => text.includes('ROLLBACK'))).toBe(false);
  });

  it('batches invoice line-item inserts and dedups repeated hashes within the import (DB-4)', async () => {
    const createdAt = new Date('2026-07-06T00:00:00.000Z');
    const billingDate = new Date('2026-06-01T00:00:00.000Z');
    const importRunBase = {
      id: '55555555-5555-4555-8555-555555555555',
      team_id: null,
      provider: 'aws',
      source_type: 'aws-cur',
      status: 'completed',
      billing_period_start: billingDate,
      billing_period_end: billingDate,
      original_file_sha256: 'a'.repeat(64),
      rows_received: 3,
      rows_accepted: 0,
      rows_rejected: 0,
      total_cost_usd: '0',
      created_by_account_id: null,
      created_at: createdAt,
      completed_at: createdAt,
      error_detail: null,
    };
    const query = jest.fn(async (text: string, values?: unknown[]) => {
      if (text.includes('INSERT INTO billing_import_runs')) {
        return { rows: [importRunBase], rowCount: 1 };
      }
      if (text.includes('INSERT INTO invoice_line_items')) {
        const payload = JSON.parse(String(values?.[0])) as Array<{
          line_item_hash: string;
          cost_usd: number;
        }>;
        return {
          rows: payload.map((entry, index) => ({
            id: `line-${index}`,
            import_run_id: importRunBase.id,
            team_id: null,
            provider: 'aws',
            billing_period_start: billingDate,
            billing_period_end: billingDate,
            usage_start: null,
            usage_end: null,
            service_name: 'AmazonEC2',
            sku_id: null,
            region: null,
            resource_id: null,
            usage_quantity: null,
            usage_unit: null,
            cost_usd: String(entry.cost_usd),
            currency: 'USD',
            tags: {},
            raw_payload: {},
            line_item_hash: entry.line_item_hash,
            matched_comparison_id: null,
            matched_trace_key: null,
            created_at: createdAt,
          })),
          rowCount: payload.length,
        };
      }
      if (text.includes('UPDATE billing_import_runs')) {
        return {
          rows: [
            {
              ...importRunBase,
              rows_accepted: values?.[1],
              rows_rejected: values?.[2],
              total_cost_usd: String(values?.[3]),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = createRepository(query);

    const lineItem = (lineItemHash: string, costUsd: number) => ({
      serviceName: 'AmazonEC2',
      costUsd,
      lineItemHash,
    });

    const result = await repository.createBillingImport({
      importInput: {
        provider: 'aws',
        sourceType: 'aws-cur',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-06-30',
        rows: [],
      },
      originalFileSha256: 'a'.repeat(64),
      // Third row repeats the first row's hash: the import must count it as a
      // reject, not double-insert it.
      rows: [
        lineItem('a'.repeat(64), 100),
        lineItem('c'.repeat(64), 50),
        lineItem('a'.repeat(64), 100),
      ],
    });

    const lineItemInsertCalls = query.mock.calls.filter(([text]) =>
      String(text).includes('INSERT INTO invoice_line_items'),
    );
    // One batched statement for the whole import, not one per row.
    expect(lineItemInsertCalls).toHaveLength(1);
    const insertedPayload = JSON.parse(String(lineItemInsertCalls[0]?.[1]?.[0])) as unknown[];
    expect(insertedPayload).toHaveLength(2); // 'a' hash deduped
    expect(result.lineItems).toHaveLength(2);
    expect(result.importRun.rowsAccepted).toBe(2);
    expect(result.importRun.rowsRejected).toBe(1);
    expect(result.importRun.totalCostUsd).toBe(150);
  });

  it('reports expired rows without deleting in report-only mode (DB-2)', async () => {
    const query = jest.fn(async (text: string) => {
      if (text.startsWith('SELECT COUNT(*)')) {
        return { rows: [{ eligible: '7' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = createRepository(query);

    const result = await repository.pruneExpiredData({
      now: '2026-08-26T00:00:00.000Z',
      mode: 'report-only',
      windows: retentionWindows(),
      maxRowsPerTable: 500,
    });

    // Report-only must count but never issue a DELETE.
    expect(query.mock.calls.some(([text]) => String(text).includes('DELETE FROM'))).toBe(false);
    expect(result.totalDeletedRows).toBe(0);
    expect(result.totalEligibleRows).toBe(7 * result.tables.length);
    expect(result.tables.map((row) => row.table)).toEqual([
      'team_audit_event_exports',
      'comparison_audit_logs',
      'account_sessions',
      'exchange_rates',
      'pricing_etl_runs',
      'team_audit_events',
    ]);
  });

  it('deletes bounded batches and guards undelivered audit exports in delete mode (DB-2)', async () => {
    const query = jest.fn(async (text: string) => {
      if (text.startsWith('SELECT COUNT(*)')) {
        return { rows: [{ eligible: '3' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 3 };
    });
    const repository = createRepository(query);

    const result = await repository.pruneExpiredData({
      now: '2026-08-26T00:00:00.000Z',
      mode: 'delete-expired',
      windows: retentionWindows(),
      maxRowsPerTable: 500,
    });

    const deletes = query.mock.calls
      .map(([text]) => String(text))
      .filter((text) => text.includes('DELETE FROM'));
    expect(deletes).toHaveLength(6);
    expect(result.totalDeletedRows).toBe(18);

    // Every delete is row-capped so a first sweep cannot hold a long lock.
    for (const statement of deletes) {
      expect(statement).toContain('LIMIT 500');
    }

    // team_audit_events must never remove an event that still has a
    // non-delivered export row (the outbox cascades on delete).
    const auditDelete = deletes.find((statement) =>
      statement.includes('DELETE FROM team_audit_events'),
    );
    expect(auditDelete).toContain('NOT EXISTS');
    expect(auditDelete).toContain("status <> 'delivered'");

    // Only delivered outbox rows are pruned.
    const outboxDelete = deletes.find((statement) =>
      statement.includes('DELETE FROM team_audit_event_exports'),
    );
    expect(outboxDelete).toContain("status = 'delivered'");
  });
});

function retentionWindows() {
  return {
    teamAuditEventDays: 2555,
    auditExportDays: 90,
    comparisonAuditLogDays: 400,
    accountSessionDays: 30,
    exchangeRateDays: 730,
    pricingEtlRunDays: 180,
  };
}

function createRepository(query: jest.Mock): ApiDatabaseRepository {
  const pool: PgPoolLike = {
    query,
    end: jest.fn(async () => undefined),
  };

  return new ApiDatabaseRepository(configService, secretsReader, () => pool);
}

function configServiceWith(overrides: Partial<AppConfig>): ConfigService<AppConfig, true> {
  return {
    get: jest.fn((key: keyof AppConfig) => {
      if (key === 'AUTH_AUDIT_EXPORT_MODE' && overrides.AUTH_AUDIT_EXPORT_MODE !== undefined) {
        return overrides.AUTH_AUDIT_EXPORT_MODE;
      }

      return (configService.get as jest.Mock)(key);
    }),
  } as unknown as ConfigService<AppConfig, true>;
}
