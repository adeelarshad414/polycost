import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { ApiValidationError } from '../api/api-errors';
import {
  ApiRateLimitService,
  RateLimitHeaderResponse,
  requestIdentity,
  writeRateLimitHeaders,
} from '../api/rate-limit.service';
import { AppConfig } from '../config/config.schema';
import { providerRegionForCanonicalRegion } from '../pricing-normalization/region-map';
import { PaymentOptionCode, PricingGranularity, PricingTermCode } from './pricing-models.types';
import { PricingMatrixService } from './pricing-matrix.service';

type QueryValue = string | string[] | undefined;
interface RequestLike {
  ip?: string;
  headers?: Record<string, unknown>;
}

const PROVIDERS: ProviderId[] = ['aws', 'azure', 'gcp'];
const GRANULARITIES: PricingGranularity[] = ['hourly', 'daily', 'weekly', 'monthly', 'yearly'];
const PAYMENT_OPTIONS: PaymentOptionCode[] = [
  'no_upfront',
  'partial_upfront',
  'all_upfront',
  'n_a',
];

@Controller('api/v1/pricing')
export class PricingModelsController {
  constructor(
    private readonly pricingMatrixService: PricingMatrixService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get(':provider/:service')
  async rate(
    @Param('provider') providerParam: string,
    @Param('service') service: string,
    @Query() query: Record<string, QueryValue>,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeRateLimit('pricing_model_rate', request, response);
    const provider = parseProvider(providerParam);

    return this.pricingMatrixService.resolveRate({
      provider,
      service: parseService(service),
      region: parseRegion(query.region, provider),
      pricingModel: parsePricingModel(query.pricingModel),
      paymentOption: parsePaymentOption(query.paymentOption),
      granularity: parseGranularity(query.granularity),
    });
  }

  @Get(':provider/:service/models')
  async models(
    @Param('provider') providerParam: string,
    @Param('service') service: string,
    @Query('region') region: QueryValue,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeRateLimit('pricing_model_options', request, response);
    const provider = parseProvider(providerParam);

    return this.pricingMatrixService.listModels(
      provider,
      parseService(service),
      parseRegion(region, provider),
    );
  }

  @Get(':provider/:service/matrix')
  async matrix(
    @Param('provider') providerParam: string,
    @Param('service') service: string,
    @Query('region') region: QueryValue,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    await this.consumeRateLimit('pricing_model_matrix', request, response);
    const provider = parseProvider(providerParam);

    return this.pricingMatrixService.matrix({
      provider,
      service: parseService(service),
      region: parseRegion(region, provider),
    });
  }

  private async consumeRateLimit(
    scope: string,
    request: RequestLike | undefined,
    response: RateLimitHeaderResponse | undefined,
  ): Promise<void> {
    const state = await this.apiRateLimitService.consume(
      scope,
      requestIdentity(request ?? {}),
      this.configService.get('RATE_LIMIT_PUBLIC_READ_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, state);
  }
}

@Controller('api/v1/compare')
export class PricingCompareV2Controller {
  constructor(
    private readonly pricingMatrixService: PricingMatrixService,
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async compare(
    @Query() query: Record<string, QueryValue>,
    @Req() request?: RequestLike,
    @Res({ passthrough: true }) response?: RateLimitHeaderResponse,
  ) {
    const state = await this.apiRateLimitService.consume(
      'pricing_compare_v2',
      requestIdentity(request ?? {}),
      this.configService.get('RATE_LIMIT_COMPARISON_PER_MINUTE', { infer: true }),
    );
    writeRateLimitHeaders(response, state);

    const canonicalRegion = optionalSingleString(query.region) ?? 'us-east';

    return this.pricingMatrixService.compare({
      services: parseServices(query.services),
      regionByProvider: {
        aws: providerRegionForCanonicalRegion(canonicalRegion, 'aws') ?? canonicalRegion,
        azure: providerRegionForCanonicalRegion(canonicalRegion, 'azure') ?? canonicalRegion,
        gcp: providerRegionForCanonicalRegion(canonicalRegion, 'gcp') ?? canonicalRegion,
      },
      pricingModel: parsePricingModel(query.pricingModel),
      paymentOption: parsePaymentOption(query.paymentOption),
      granularity: parseGranularity(query.granularity),
    });
  }
}

function parseProvider(value: string): ProviderId {
  if (!PROVIDERS.includes(value as ProviderId)) {
    throw new ApiValidationError('Unsupported provider', [
      {
        field: 'provider',
        issue: `must be one of ${PROVIDERS.join(', ')}`,
      },
    ]);
  }

  return value as ProviderId;
}

function parseService(value: string): string {
  const service = decodeURIComponent(value).trim();

  if (!service) {
    throw new ApiValidationError('service is required', [
      {
        field: 'service',
        issue: 'must be a non-empty service slug',
      },
    ]);
  }

  return service;
}

function parseRegion(value: QueryValue, provider: ProviderId): string {
  const rawRegion = optionalSingleString(value) ?? 'us-east';

  return providerRegionForCanonicalRegion(rawRegion, provider) ?? rawRegion;
}

function parsePricingModel(value: QueryValue): PricingTermCode {
  const rawModel = optionalSingleString(value) ?? 'on_demand';

  switch (rawModel) {
    case 'on-demand':
    case 'on_demand':
      return 'on_demand';
    case 'reserved-1yr':
    case 'reserved_1yr':
      return 'reserved_1yr';
    case 'reserved-3yr':
    case 'reserved_3yr':
      return 'reserved_3yr';
    case 'savings-plan':
    case 'savings_plan':
    case 'savings_plan_1yr':
      return 'savings_plan_1yr';
    case 'savings-plan-3yr':
    case 'savings_plan_3yr':
      return 'savings_plan_3yr';
    case 'spot':
    case 'spot_estimate':
      return 'spot_estimate';
    default:
      throw new ApiValidationError('Unsupported pricing model', [
        {
          field: 'pricingModel',
          issue:
            'must be one of on_demand, reserved_1yr, reserved_3yr, savings_plan_1yr, savings_plan_3yr, spot_estimate',
        },
      ]);
  }
}

function parsePaymentOption(value: QueryValue): PaymentOptionCode | undefined {
  const rawPaymentOption = optionalSingleString(value);

  if (!rawPaymentOption) {
    return undefined;
  }

  if (!PAYMENT_OPTIONS.includes(rawPaymentOption as PaymentOptionCode)) {
    throw new ApiValidationError('Unsupported payment option', [
      {
        field: 'paymentOption',
        issue: `must be one of ${PAYMENT_OPTIONS.join(', ')}`,
      },
    ]);
  }

  return rawPaymentOption as PaymentOptionCode;
}

function parseGranularity(value: QueryValue): PricingGranularity {
  const granularity = optionalSingleString(value) ?? 'monthly';

  if (!GRANULARITIES.includes(granularity as PricingGranularity)) {
    throw new ApiValidationError('Unsupported granularity', [
      {
        field: 'granularity',
        issue: `must be one of ${GRANULARITIES.join(', ')}`,
      },
    ]);
  }

  return granularity as PricingGranularity;
}

function parseServices(value: QueryValue): string[] {
  const rawValue = optionalSingleString(value);

  if (!rawValue) {
    return ['compute'];
  }

  return rawValue
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((service) => service.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

function optionalSingleString(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
