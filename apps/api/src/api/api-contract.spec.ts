import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComparisonUnavailableError } from '../comparison/comparison-orchestrator.service';
import { ComparisonResult } from '../comparison/comparison.types';
import { AppConfig } from '../config/config.schema';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { NWSMigrationError, NWSValidationError } from '../nws/nws-validator';
import { NWSParseInputError } from '../nws-parser/nl-parser.service';
import { ParsedNwsDraft } from '../nws-parser/nws-parser.types';
import { CsvReportGenerator } from '../reports/csv-report.generator';
import { ExcelReportGenerator } from '../reports/excel-report.generator';
import { PdfReportGenerator } from '../reports/pdf-report.generator';
import { ReportService } from '../reports/report.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiRateLimitService } from './rate-limit.service';
import { ComparisonApplicationService } from './comparison-application.service';
import { ComparisonsController } from './comparisons.controller';
import {
  AlertsController,
  BudgetsController,
  CachedPricingController,
  ExchangeRatesController,
  SharedReportsController,
  ShareLinksController,
  WorkloadsController,
} from './cost-management.controller';
import { CostManagementService } from './cost-management.service';
import { DataHealthController } from './data-health.controller';
import {
  AlertRecord,
  BudgetRecord,
  CachedPricingCompareRow,
  ExchangeRatesResponse,
  SharedReportResponse,
  ShareLinkResponse,
  WorkloadCostBreakdown,
  WorkloadRecord,
} from './cost-management.types';
import {
  ApiNotFoundError,
  ApiUnauthorizedError,
  ApiValidationError,
  LiveRefreshUnavailableError,
  RateLimitExceededError,
} from './api-errors';
import { PricingStatusController } from './pricing-status.controller';
import { RegionsController } from './regions.controller';
import { WorkloadController } from './workload.controller';

const validNws: NormalizedWorkloadSpec = {
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

const comparisonResult: ComparisonResult = {
  comparisonId: '11111111-1111-4111-8111-111111111111',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'aws',
  providers: [
    {
      providerId: 'aws',
      lineItems: [
        {
          category: 'compute',
          description: 'web compute',
          isApproximate: false,
          baseMonthlyCostUsd: 30,
        },
      ],
      totals: {
        daily: 1,
        weekly: 7,
        monthly: 30,
        quarterly: 90,
        yearly: 360,
      },
    },
  ],
};

const workloadRecord: WorkloadRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  instanceFamily: 'general-purpose',
  vcpu: 4,
  memoryGb: 16,
  region: 'us-east',
  instanceCount: 2,
  hoursPerMonth: 730,
  storageGb: 500,
  storageTier: 'standard',
  egressGbPerMonth: 1200,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
};

const cachedCompareRows: CachedPricingCompareRow[] = [
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
];

const workloadBreakdown: WorkloadCostBreakdown = {
  workloadId: workloadRecord.id,
  term: 'on_demand',
  providers: [
    {
      provider: 'aws',
      region: 'us-east-1',
      compute: 280.32,
      storage: 11.5,
      egress: 108,
      total: 399.82,
      currency: 'USD',
    },
  ],
};

const budgetRecord: BudgetRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  workloadId: workloadRecord.id,
  thresholdUsd: 500,
  alertOnAnomalyPercent: 20,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
};

const alertRecord: AlertRecord = {
  id: '55555555-5555-4555-8555-555555555555',
  workloadId: workloadRecord.id,
  budgetId: budgetRecord.id,
  alertType: 'budget_threshold',
  message: 'Budget threshold exceeded',
  thresholdUsd: 500,
  observedUsd: 520,
  dismissed: false,
  triggeredAt: '2026-06-29T00:00:00.000Z',
};

const shareLinkResponse: ShareLinkResponse = {
  token: 'share-token-12345678901234567890',
  url: '/api/v1/share/share-token-12345678901234567890',
};

const sharedReportResponse: SharedReportResponse = {
  token: shareLinkResponse.token,
  watermark: true,
  expiresAt: '2026-07-29T00:00:00.000Z',
  pricingModel: 'reserved-3yr',
  granularity: 'yearly',
  passwordProtected: true,
  workload: workloadRecord,
  breakdown: workloadBreakdown,
};

const shareLinkAnalyticsResponse = {
  token: shareLinkResponse.token,
  totalViews: 3,
  lastViewedAt: '2026-07-01T00:00:00.000Z',
  countryViews: [
    {
      countryCode: 'US',
      views: 2,
    },
  ],
  sectionViews: [
    {
      section: 'summary',
      views: 3,
      lastViewedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
};

const exchangeRatesResponse: ExchangeRatesResponse = {
  base: 'USD',
  lastUpdated: '2026-06-29T00:00:00.000Z',
  rates: {
    EUR: 0.93,
    PKR: 278,
  },
};

const configService = {
  get: jest.fn((key: keyof AppConfig) => {
    switch (key) {
      case 'RATE_LIMIT_NL_PARSE_PER_MINUTE':
      case 'RATE_LIMIT_LIVE_REFRESH_PER_MINUTE':
        return 2;
      case 'FEATURE_LIVE_PRICING_REFRESH_ENABLED':
        return true;
      default:
        return undefined;
    }
  }),
} as unknown as ConfigService<AppConfig, true>;

describe('API contracts', () => {
  it('POST /workload/parse returns the documented parser response', async () => {
    const parsed: ParsedNwsDraft = {
      draftNws: validNws,
      parserConfidence: 'high',
      fieldsRequiringReview: ['compute[0].instanceCount'],
    };
    const controller = new WorkloadController(
      {
        parse: jest.fn(async () => parsed),
      } as never,
      {
        validateNws: jest.fn(),
      } as never,
      new ApiRateLimitService(() => 0),
      configService,
    );
    const response = {
      header: jest.fn(),
    };

    await expect(
      controller.parse(
        {
          naturalLanguageInput: 'web app with postgres',
        },
        {
          ip: '127.0.0.1',
          headers: {},
        },
        response,
      ),
    ).resolves.toEqual(parsed);
    expect(response.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
  });

  it('POST /workload/validate returns { valid: true } for valid NWS', async () => {
    const controller = new WorkloadController(
      {
        parse: jest.fn(),
      } as never,
      {
        validateNws: jest.fn(async () => ({ valid: true })),
      } as never,
      new ApiRateLimitService(() => 0),
      configService,
    );

    await expect(controller.validate(validNws)).resolves.toEqual({ valid: true });
  });

  it('POST /comparisons persists and returns the comparison result', async () => {
    const service = comparisonApplicationService();
    const controller = comparisonsController(service);

    await expect(
      controller.create({
        nws: validNws,
        options: {
          useLivePricing: false,
        },
      }),
    ).resolves.toEqual(comparisonResult);
    expect(service.createComparison).toHaveBeenCalledWith(validNws, {
      useLivePricing: false,
    });
  });

  it('GET /comparisons/:id returns a previous snapshot', async () => {
    const service = comparisonApplicationService();
    const controller = comparisonsController(service);

    await expect(controller.get(comparisonResult.comparisonId)).resolves.toEqual(comparisonResult);
  });

  it('GET /comparisons/:id/export returns a binary download with content headers', async () => {
    const service = comparisonApplicationService();
    const controller = comparisonsController(service);
    const response = {
      header: jest.fn(),
    };

    const file = await controller.export(
      comparisonResult.comparisonId,
      'csv',
      'quarterly',
      'reserved-3yr',
      response,
    );

    expect(file.getHeaders()).toEqual({
      type: 'text/csv',
      disposition:
        'attachment; filename="polycost-comparison-11111111-1111-4111-8111-111111111111.csv"',
      length: expect.any(Number),
    });
    expect(response.header).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(response.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="polycost-comparison-11111111-1111-4111-8111-111111111111.csv"',
    );
  });

  it('POST /comparisons/:id/refresh-live creates a new comparison snapshot', async () => {
    const service = comparisonApplicationService();
    const controller = comparisonsController(service);

    await expect(
      controller.refreshLive(comparisonResult.comparisonId, {
        ip: '127.0.0.1',
        headers: {},
      }),
    ).resolves.toEqual(comparisonResult);
    expect(service.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, true);
  });

  it('GET /pricing/status returns provider status through the controller', async () => {
    const service = comparisonApplicationService();
    const controller = new PricingStatusController(service as never);

    await expect(controller.getStatus()).resolves.toEqual({
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          recordsUpdated: 12,
          recordsRejected: 0,
          recordsSkipped: 3,
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
      ],
    });
  });

  it('GET /data-health returns public pricing freshness through the controller', async () => {
    const service = comparisonApplicationService();
    const controller = new DataHealthController(service as never);

    await expect(controller.getDataHealth()).resolves.toEqual({
      generatedAt: '2026-07-01T00:00:00.000Z',
      freshnessPolicyHours: 24,
      overallStatus: 'fresh',
      alertCount: 0,
      alerts: [],
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          freshness: 'fresh',
          ageHours: 1,
          recordsUpdated: 12,
          recordsRejected: 0,
          recordsSkipped: 3,
          lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
          message: 'Pricing cache refreshed 1h ago.',
        },
      ],
    });
  });

  it('GET /pricing/compare reads normalized cached pricing only', async () => {
    const service = costManagementService();
    const controller = new CachedPricingController(service);

    await expect(
      controller.compare({
        instanceFamily: 'general-purpose',
        vcpu: '4',
        memoryGb: '16',
        region: 'us-east',
        term: 'on_demand',
      }),
    ).resolves.toEqual(cachedCompareRows);
    expect(service.compareCachedPricing).toHaveBeenCalledWith({
      instanceFamily: 'general-purpose',
      vcpu: 4,
      memoryGb: 16,
      region: 'us-east',
      term: 'on_demand',
    });
  });

  it('GET /pricing/models returns provider-specific model terminology', () => {
    const service = costManagementService();
    const controller = new CachedPricingController(service);

    expect(controller.models()).toEqual({
      defaultModel: 'on-demand',
      generatedAt: expect.any(String),
      models: expect.arrayContaining([
        expect.objectContaining({
          model: 'spot',
          cachedTerm: 'spot',
          volatility: 'volatile',
          providerTerms: expect.objectContaining({
            aws: 'EC2 Spot Instances',
            azure: 'Azure Spot VMs',
            gcp: 'Google Cloud Spot VMs',
          }),
        }),
        expect.objectContaining({
          model: 'savings-plan',
          cachedTerm: 'savings_plan',
          providerTerms: expect.objectContaining({
            aws: 'AWS Savings Plans',
            gcp: 'Committed use discounts',
          }),
        }),
      ]),
    });
  });

  it('GET /pricing/breakdown reads workload breakdown from cached tables', async () => {
    const service = costManagementService();
    const controller = new CachedPricingController(service);

    await expect(
      controller.breakdown({
        workloadId: workloadRecord.id,
        term: 'reserved_1yr',
      }),
    ).resolves.toEqual(workloadBreakdown);
    expect(service.getWorkloadCostBreakdown).toHaveBeenCalledWith(
      workloadRecord.id,
      'reserved_1yr',
    );
  });

  it('POST /workloads persists a normalized workload config', async () => {
    const service = costManagementService();
    const controller = new WorkloadsController(service);

    await expect(
      controller.create({
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
    ).resolves.toEqual(workloadRecord);
    expect(service.createWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceFamily: 'general-purpose',
        region: 'us-east',
        storageTier: 'standard',
      }),
    );
  });

  it('rejects unsupported canonical regions instead of guessing equivalence', async () => {
    const controller = new WorkloadsController(costManagementService());

    expect(() =>
      controller.create({
        instanceFamily: 'general-purpose',
        vcpu: 4,
        memoryGb: 16,
        region: 'moon-west',
      }),
    ).toThrow(ApiValidationError);
  });

  it('POST /budgets and GET/PATCH /alerts expose budget alert workflows', async () => {
    const service = costManagementService();
    const budgetsController = new BudgetsController(service);
    const alertsController = new AlertsController(service);

    await expect(
      budgetsController.create({
        workloadId: workloadRecord.id,
        thresholdUsd: 500,
        alertOnAnomalyPercent: 20,
      }),
    ).resolves.toEqual(budgetRecord);
    await expect(alertsController.list(workloadRecord.id)).resolves.toEqual([alertRecord]);
    await expect(alertsController.update(alertRecord.id, { dismissed: true })).resolves.toEqual(
      alertRecord,
    );
    expect(service.createBudget).toHaveBeenCalledWith({
      workloadId: workloadRecord.id,
      thresholdUsd: 500,
      alertOnAnomalyPercent: 20,
    });
    expect(service.updateAlertDismissed).toHaveBeenCalledWith(alertRecord.id, true);
  });

  it('POST /share-links and GET /share/:token expose scoped read-only reports', async () => {
    const service = costManagementService();
    const shareLinksController = new ShareLinksController(service);
    const sharedReportsController = new SharedReportsController(service);

    await expect(
      shareLinksController.create({
        workloadId: workloadRecord.id,
        watermark: true,
        expiresInDays: 30,
        pricingModel: 'reserved-3yr',
        granularity: 'yearly',
        password: 'client-demo',
      }),
    ).resolves.toEqual(shareLinkResponse);
    expect(service.createShareLink).toHaveBeenCalledWith({
      workloadId: workloadRecord.id,
      watermark: true,
      expiresInDays: 30,
      pricingModel: 'reserved-3yr',
      granularity: 'yearly',
      password: 'client-demo',
    });
    await expect(
      sharedReportsController.get(shareLinkResponse.token, 'client-demo', 'summary', {
        headers: {
          'cf-ipcountry': 'US',
          'user-agent': 'jest',
        },
      }),
    ).resolves.toEqual(sharedReportResponse);
    expect(service.getSharedReport).toHaveBeenCalledWith(shareLinkResponse.token, 'client-demo', {
      countryCode: 'US',
      section: 'summary',
      userAgent: 'jest',
    });
    await expect(shareLinksController.analytics(shareLinkResponse.token)).resolves.toEqual(
      shareLinkAnalyticsResponse,
    );
    await expect(shareLinksController.revoke(shareLinkResponse.token)).resolves.toEqual(
      shareLinkResponse,
    );
  });

  it('GET /exchange-rates returns cached currency data', async () => {
    const service = costManagementService();
    const controller = new ExchangeRatesController(service);

    await expect(controller.get('usd')).resolves.toEqual(exchangeRatesResponse);
    expect(service.getExchangeRates).toHaveBeenCalledWith('USD');
  });

  it('GET /regions returns the cloud region catalog without an admin key', async () => {
    const catalog = {
      generatedAt: '2026-06-29T00:00:00.000Z',
      cacheTtlSeconds: 43_200,
      providers: [
        {
          providerId: 'aws' as const,
          label: 'AWS',
          source: 'live' as const,
          sourceUrl: 'https://b0.p.awsstatic.com/locations/1.0/aws/current/locations.json',
          calculatorUrl: 'https://calculator.aws/#/',
          regions: [
            {
              providerId: 'aws' as const,
              id: 'us-east-1',
              label: 'US East (N. Virginia)',
              source: 'live' as const,
            },
          ],
        },
      ],
    };
    const service = {
      getRegionCatalog: jest.fn(async () => catalog),
    };
    const controller = new RegionsController(service as never);

    await expect(controller.getRegions()).resolves.toEqual(catalog);
    expect(service.getRegionCatalog).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid comparison and export request shapes', async () => {
    const controller = comparisonsController(comparisonApplicationService());

    await expect(controller.create({})).rejects.toThrow(ApiValidationError);
    await expect(
      controller.export(comparisonResult.comparisonId, 'docx', undefined, undefined, {
        header: jest.fn(),
      }),
    ).rejects.toThrow(ApiValidationError);
  });

  it('rate limits parse requests by identity', async () => {
    const controller = new WorkloadController(
      {
        parse: jest.fn(async () => ({
          draftNws: validNws,
          parserConfidence: 'high',
          fieldsRequiringReview: [],
        })),
      } as never,
      {
        validateNws: jest.fn(),
      } as never,
      new ApiRateLimitService(() => 0),
      configService,
    );
    const request = {
      ip: '127.0.0.1',
      headers: {},
    };

    await controller.parse({ naturalLanguageInput: 'web app' }, request);
    await controller.parse({ naturalLanguageInput: 'web app' }, request);
    await expect(controller.parse({ naturalLanguageInput: 'web app' }, request)).rejects.toThrow(
      RateLimitExceededError,
    );
  });

  it('protects admin-only pricing status with a Vault-backed API key', async () => {
    const guard = new AdminApiKeyGuard({
      getSecret: jest.fn(async () => 'expected-admin-key'),
    });
    const context = executionContext({
      'x-admin-api-key': 'expected-admin-key',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(
      new AdminApiKeyGuard({
        getSecret: jest.fn(async () => 'expected-admin-key'),
      }).canActivate(executionContext({})),
    ).rejects.toThrow(ApiUnauthorizedError);
    await expect(
      new AdminApiKeyGuard({
        getSecret: jest.fn(async () => 'expected-admin-key'),
      }).canActivate(executionContext({ 'x-admin-api-key': 'wrong-admin-key' })),
    ).rejects.toThrow(ApiUnauthorizedError);
    await expect(
      new AdminApiKeyGuard({
        getSecret: jest.fn(async () => 'expected-admin-key'),
      }).canActivate(executionContext({ 'x-admin-api-key': ['expected-admin-key'] })),
    ).resolves.toBe(true);
  });

  it('formats validation errors with the documented envelope', () => {
    const response = applyFilter(
      new NWSValidationError('Invalid Normalized Workload Specification', [
        {
          path: 'workload.type',
          message: 'Required',
        },
      ]),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid Normalized Workload Specification',
        details: [
          {
            field: 'workload.type',
            issue: 'Required',
          },
        ],
      },
    });
  });

  it('formats every documented API error branch', () => {
    expect(
      applyFilter(new NWSMigrationError([{ path: 'schemaVersion', message: 'old' }])).body(),
    ).toEqual({
      error: {
        code: 'NWS_MIGRATION_REQUIRED',
        message: 'NWS schema migration required',
        details: [{ field: 'schemaVersion', issue: 'old' }],
      },
    });
    expect(applyFilter(new ApiValidationError('Bad body')).body()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Bad body',
      },
    });
    expect(applyFilter(new NWSParseInputError('Not a workload')).status).toHaveBeenCalledWith(422);
    expect(applyFilter(new ApiNotFoundError('Missing')).status).toHaveBeenCalledWith(404);
    expect(applyFilter(new ApiUnauthorizedError('Nope')).status).toHaveBeenCalledWith(401);

    const rateLimited = applyFilter(new RateLimitExceededError('Slow down', 17), true);
    expect(rateLimited.status).toHaveBeenCalledWith(429);
    expect(rateLimited.header).toHaveBeenCalledWith('Retry-After', '17');

    expect(
      applyFilter(
        new ComparisonUnavailableError([
          {
            providerId: 'aws',
            code: 'provider_pricing_failed',
            message: 'AWS failed',
          },
        ]),
      ).body(),
    ).toEqual({
      error: {
        code: 'PRICING_UNAVAILABLE',
        message: 'No provider pricing results were available',
        details: [{ field: 'aws', issue: 'AWS failed' }],
      },
    });
    expect(applyFilter(new LiveRefreshUnavailableError('Disabled')).status).toHaveBeenCalledWith(
      503,
    );
    expect(applyFilter(new HttpException({ message: 'Framework error' }, 418)).body()).toEqual({
      error: {
        code: 'HTTP_ERROR',
        message: 'Framework error',
      },
    });
    expect(applyFilter(new HttpException('Plain framework error', 409)).body()).toEqual({
      error: {
        code: 'HTTP_ERROR',
        message: 'Plain framework error',
      },
    });
    expect(applyFilter(new Error('boom')).body()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      },
    });
  });

  it('uses forwarded IP identity and resets rate-limit windows', () => {
    let now = 0;
    const limiter = new ApiRateLimitService(() => now);

    limiter.consume('parse', '203.0.113.1', 1);
    expect(() => limiter.consume('parse', '203.0.113.1', 1)).toThrow(RateLimitExceededError);

    now = 60_000;
    expect(() => limiter.consume('parse', '203.0.113.1', 1)).not.toThrow();
  });

  it('runs comparison application persistence and status flows', async () => {
    const orchestrator = {
      compare: jest.fn(async () => comparisonResult),
    };
    const repository = {
      saveComparison: jest.fn(async () => undefined),
      recordComparisonAuditLog: jest.fn(async () => undefined),
      getComparison: jest.fn(async () => ({
        nwsSnapshot: validNws,
        resultSnapshot: comparisonResult,
      })),
      getPricingStatus: jest.fn(async () => ({
        providers: [],
      })),
    };
    const liveRefresh = {
      refreshSnapshot: jest.fn(async () => []),
    };
    const service = new ComparisonApplicationService(
      orchestrator as never,
      repository as never,
      liveRefresh as never,
    );

    await expect(service.createComparison(validNws, { useLivePricing: false })).resolves.toEqual(
      comparisonResult,
    );
    expect(repository.saveComparison).toHaveBeenCalledWith(validNws, comparisonResult);
    expect(repository.recordComparisonAuditLog).toHaveBeenCalledWith(comparisonResult);
    await expect(service.getComparison(comparisonResult.comparisonId)).resolves.toEqual({
      nwsSnapshot: validNws,
      resultSnapshot: comparisonResult,
    });
    await expect(
      service.refreshLiveComparison(comparisonResult.comparisonId, true),
    ).resolves.toEqual(comparisonResult);
    expect(liveRefresh.refreshSnapshot).toHaveBeenCalledWith({
      nwsSnapshot: validNws,
      resultSnapshot: comparisonResult,
    });
    await expect(service.validateNws(validNws)).resolves.toEqual({ valid: true });
    await expect(service.getPricingStatus()).resolves.toEqual({ providers: [] });
  });

  it('merges live-refresh warnings into refreshed comparison snapshots', async () => {
    const refreshedResult: ComparisonResult = {
      ...comparisonResult,
      comparisonId: '22222222-2222-4222-8222-222222222222',
    };
    const repository = {
      saveComparison: jest.fn(async () => undefined),
      recordComparisonAuditLog: jest.fn(async () => undefined),
      getComparison: jest.fn(async () => ({
        nwsSnapshot: validNws,
        resultSnapshot: comparisonResult,
      })),
      getPricingStatus: jest.fn(),
    };
    const service = new ComparisonApplicationService(
      {
        compare: jest.fn(async () => refreshedResult),
      } as never,
      repository as never,
      {
        refreshSnapshot: jest.fn(async () => [
          {
            providerId: 'azure',
            code: 'live_refresh_failed',
            message: 'azure live refresh failed: provider throttled',
          },
        ]),
      } as never,
    );

    await expect(
      service.refreshLiveComparison(comparisonResult.comparisonId, true),
    ).resolves.toEqual({
      ...refreshedResult,
      warnings: [
        {
          providerId: 'azure',
          code: 'live_refresh_failed',
          message: 'azure live refresh failed: provider throttled',
        },
      ],
    });
    expect(repository.saveComparison).toHaveBeenCalledWith(validNws, {
      ...refreshedResult,
      warnings: [
        {
          providerId: 'azure',
          code: 'live_refresh_failed',
          message: 'azure live refresh failed: provider throttled',
        },
      ],
    });
    expect(repository.recordComparisonAuditLog).toHaveBeenCalledWith({
      ...refreshedResult,
      warnings: [
        {
          providerId: 'azure',
          code: 'live_refresh_failed',
          message: 'azure live refresh failed: provider throttled',
        },
      ],
    });
  });

  it('reports comparison application not-found and disabled live-refresh failures', async () => {
    const service = new ComparisonApplicationService(
      {
        compare: jest.fn(),
      } as never,
      {
        saveComparison: jest.fn(),
        recordComparisonAuditLog: jest.fn(),
        getComparison: jest.fn(async () => undefined),
        getPricingStatus: jest.fn(),
      } as never,
    );

    await expect(service.getComparison(comparisonResult.comparisonId)).rejects.toThrow(
      ApiNotFoundError,
    );
    await expect(
      service.refreshLiveComparison(comparisonResult.comparisonId, false),
    ).rejects.toThrow(LiveRefreshUnavailableError);
    await expect(service.createComparison(validNws, { useLivePricing: true })).rejects.toThrow(
      LiveRefreshUnavailableError,
    );
  });
});

function comparisonApplicationService() {
  return {
    createComparison: jest.fn(async () => comparisonResult),
    getComparison: jest.fn(async () => ({
      nwsSnapshot: validNws,
      resultSnapshot: comparisonResult,
    })),
    refreshLiveComparison: jest.fn(async () => comparisonResult),
    getPricingStatus: jest.fn(async () => ({
      providers: [
        {
          providerId: 'aws',
          status: 'success',
          recordsUpdated: 12,
          recordsRejected: 0,
          recordsSkipped: 3,
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
      ],
    })),
    getDataHealth: jest.fn(async () => ({
      generatedAt: '2026-07-01T00:00:00.000Z',
      freshnessPolicyHours: 24,
      overallStatus: 'fresh' as const,
      alertCount: 0,
      alerts: [],
      providers: [
        {
          providerId: 'aws' as const,
          status: 'success' as const,
          freshness: 'fresh' as const,
          ageHours: 1,
          recordsUpdated: 12,
          recordsRejected: 0,
          recordsSkipped: 3,
          lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
          message: 'Pricing cache refreshed 1h ago.',
        },
      ],
    })),
  } as unknown as jest.Mocked<ComparisonApplicationService>;
}

function costManagementService() {
  return {
    createWorkload: jest.fn(async () => workloadRecord),
    compareCachedPricing: jest.fn(async () => cachedCompareRows),
    getWorkloadCostBreakdown: jest.fn(async () => workloadBreakdown),
    createBudget: jest.fn(async () => budgetRecord),
    listAlerts: jest.fn(async () => [alertRecord]),
    updateAlertDismissed: jest.fn(async () => alertRecord),
    createShareLink: jest.fn(async () => shareLinkResponse),
    getSharedReport: jest.fn(async () => sharedReportResponse),
    getShareLinkAnalytics: jest.fn(async () => shareLinkAnalyticsResponse),
    revokeShareLink: jest.fn(async () => shareLinkResponse),
    getExchangeRates: jest.fn(async () => exchangeRatesResponse),
  } as unknown as jest.Mocked<CostManagementService>;
}

function comparisonsController(service: jest.Mocked<ComparisonApplicationService>) {
  return new ComparisonsController(
    service,
    new ReportService(
      new PdfReportGenerator(),
      new CsvReportGenerator(),
      new ExcelReportGenerator(),
    ),
    new ApiRateLimitService(() => 0),
    configService,
  );
}

function executionContext(headers: Record<string, string | string[] | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
      }),
    }),
  } as never;
}

function applyFilter(exception: unknown, includeHeader = false) {
  const sent = jest.fn();
  const status = jest.fn(() => ({
    send: sent,
  }));
  const header = jest.fn();
  const response = includeHeader
    ? {
        status,
        header,
      }
    : {
        status,
      };
  const filter = new ApiExceptionFilter();

  filter.catch(exception, {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as never);

  return {
    status,
    send: sent,
    header,
    body: () => sent.mock.calls[0][0],
  };
}
