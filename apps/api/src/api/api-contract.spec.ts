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

    const file = await controller.export(comparisonResult.comparisonId, 'csv', response);

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
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
      ],
    });
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
      controller.export(comparisonResult.comparisonId, 'docx', { header: jest.fn() }),
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
      getComparison: jest.fn(async () => ({
        nwsSnapshot: validNws,
        resultSnapshot: comparisonResult,
      })),
      getPricingStatus: jest.fn(async () => ({
        providers: [],
      })),
    };
    const service = new ComparisonApplicationService(orchestrator as never, repository as never);

    await expect(service.createComparison(validNws, { useLivePricing: false })).resolves.toEqual(
      comparisonResult,
    );
    expect(repository.saveComparison).toHaveBeenCalledWith(validNws, comparisonResult);
    await expect(service.getComparison(comparisonResult.comparisonId)).resolves.toEqual({
      nwsSnapshot: validNws,
      resultSnapshot: comparisonResult,
    });
    await expect(
      service.refreshLiveComparison(comparisonResult.comparisonId, true),
    ).resolves.toEqual(comparisonResult);
    await expect(service.validateNws(validNws)).resolves.toEqual({ valid: true });
    await expect(service.getPricingStatus()).resolves.toEqual({ providers: [] });
  });

  it('reports comparison application not-found and disabled live-refresh failures', async () => {
    const service = new ComparisonApplicationService(
      {
        compare: jest.fn(),
      } as never,
      {
        saveComparison: jest.fn(),
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
          lastSuccessfulRun: '2026-06-29T00:00:00.000Z',
        },
      ],
    })),
  } as unknown as jest.Mocked<ComparisonApplicationService>;
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
