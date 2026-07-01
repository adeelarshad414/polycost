import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  providerRegionsForCanonicalRegion,
  supportedCanonicalRegions,
} from '../pricing-normalization/region-map';
import { ApiValidationError } from './api-errors';
import { CostManagementService } from './cost-management.service';
import {
  BudgetInput,
  CachedPricingCompareQuery,
  CachedPricingTerm,
  PricingModelCatalogResponse,
  ShareLinkInput,
  StoragePricingTier,
  WorkloadInput,
} from './cost-management.types';

type QueryValue = string | string[] | undefined;
interface RequestLike {
  headers?: Record<string, unknown>;
}

const INSTANCE_FAMILIES = [
  'general-purpose',
  'compute-optimized',
  'memory-optimized',
  'storage-optimized',
  'accelerated-computing',
] as const;
const STORAGE_TIERS: StoragePricingTier[] = ['standard', 'infrequent_access', 'archive'];
const PRICING_TERMS: CachedPricingTerm[] = [
  'on_demand',
  'reserved_1yr',
  'reserved_3yr',
  'spot',
  'savings_plan',
];

@Controller('api/v1/pricing')
export class CachedPricingController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Get('compare')
  compare(@Query() query: Record<string, QueryValue>) {
    return this.costManagementService.compareCachedPricing(parseCompareQuery(query));
  }

  @Get('breakdown')
  breakdown(@Query() query: Record<string, QueryValue>) {
    const workloadId = parseRequiredString(query.workloadId, 'workloadId');
    const term = parsePricingTerm(query.term);

    return this.costManagementService.getWorkloadCostBreakdown(workloadId, term);
  }

  @Get('models')
  models(): PricingModelCatalogResponse {
    return pricingModelCatalog();
  }
}

@Controller('api/v1/workloads')
export class WorkloadsController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.costManagementService.createWorkload(parseWorkloadInput(body));
  }
}

@Controller('api/v1/budgets')
export class BudgetsController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.costManagementService.createBudget(parseBudgetInput(body));
  }
}

@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Get()
  list(@Query('workloadId') workloadId?: QueryValue) {
    return this.costManagementService.listAlerts(optionalSingleString(workloadId));
  }

  @Patch(':id')
  update(@Param('id') alertId: string, @Body() body: unknown) {
    return this.costManagementService.updateAlertDismissed(alertId, parseDismissedUpdate(body));
  }
}

@Controller('api/v1/share-links')
export class ShareLinksController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.costManagementService.createShareLink(parseShareLinkInput(body));
  }

  @Post(':token/revoke')
  revoke(@Param('token') token: string) {
    return this.costManagementService.revokeShareLink(token);
  }

  @Get(':token/analytics')
  analytics(@Param('token') token: string) {
    return this.costManagementService.getShareLinkAnalytics(token);
  }
}

@Controller('api/v1/share')
export class SharedReportsController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Get(':token')
  get(
    @Param('token') token: string,
    @Query('password') password: QueryValue,
    @Query('section') section: QueryValue,
    @Req() request: RequestLike,
  ) {
    return this.costManagementService.getSharedReport(token, optionalSingleString(password), {
      countryCode: countryCodeFromHeaders(request.headers ?? {}),
      section: optionalSingleString(section) ?? 'summary',
      userAgent: optionalSingleString(request.headers?.['user-agent']),
    });
  }
}

@Controller('api/v1/exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly costManagementService: CostManagementService) {}

  @Get()
  get(@Query('base') base?: QueryValue) {
    return this.costManagementService.getExchangeRates(parseCurrency(base ?? 'USD', 'base'));
  }
}

function parseCompareQuery(query: Record<string, QueryValue>): CachedPricingCompareQuery {
  return {
    instanceFamily: parseInstanceFamily(query.instanceFamily),
    vcpu: parsePositiveNumber(query.vcpu, 'vcpu', true),
    memoryGb: parsePositiveNumber(query.memoryGb, 'memoryGb'),
    region: parseCanonicalRegion(query.region),
    term: parsePricingTerm(query.term),
  };
}

function parseWorkloadInput(body: unknown): WorkloadInput {
  const record = requireRecord(body, 'Workload request body must be an object');

  return {
    instanceFamily: parseInstanceFamily(record.instanceFamily),
    vcpu: parsePositiveNumber(record.vcpu, 'vcpu', true),
    memoryGb: parsePositiveNumber(record.memoryGb, 'memoryGb'),
    region: parseCanonicalRegion(record.region),
    instanceCount: parsePositiveNumber(record.instanceCount ?? 1, 'instanceCount', true),
    hoursPerMonth: parsePositiveNumber(record.hoursPerMonth ?? 730, 'hoursPerMonth'),
    storageGb: parseNonNegativeNumber(record.storageGb ?? 0, 'storageGb'),
    storageTier: parseStorageTier(record.storageTier ?? 'standard'),
    egressGbPerMonth: parseNonNegativeNumber(record.egressGbPerMonth ?? 0, 'egressGbPerMonth'),
  };
}

function parseBudgetInput(body: unknown): BudgetInput {
  const record = requireRecord(body, 'Budget request body must be an object');

  return {
    workloadId: parseRequiredString(record.workloadId, 'workloadId'),
    thresholdUsd: parsePositiveNumber(record.thresholdUsd, 'thresholdUsd'),
    ...(record.alertOnAnomalyPercent !== undefined
      ? {
          alertOnAnomalyPercent: parsePositiveNumber(
            record.alertOnAnomalyPercent,
            'alertOnAnomalyPercent',
          ),
        }
      : {}),
  };
}

function parseShareLinkInput(body: unknown): ShareLinkInput {
  const record = requireRecord(body, 'Share-link request body must be an object');

  return {
    workloadId: parseRequiredString(record.workloadId, 'workloadId'),
    watermark: typeof record.watermark === 'boolean' ? record.watermark : true,
    expiresInDays: parsePositiveNumber(record.expiresInDays, 'expiresInDays', true),
    pricingModel: parseSharePricingModel(record.pricingModel ?? 'on-demand'),
    granularity: parseShareGranularity(record.granularity ?? 'monthly'),
    ...(typeof record.password === 'string' && record.password.trim()
      ? { password: record.password.trim() }
      : {}),
  };
}

function countryCodeFromHeaders(headers: Record<string, unknown>): string | undefined {
  return (
    optionalSingleString(headers['cloudfront-viewer-country']) ??
    optionalSingleString(headers['cf-ipcountry']) ??
    optionalSingleString(headers['x-vercel-ip-country'])
  );
}

function parseSharePricingModel(value: unknown): ShareLinkInput['pricingModel'] {
  const pricingModel = parseRequiredString(value, 'pricingModel');

  if (
    pricingModel === 'on-demand' ||
    pricingModel === 'reserved-1yr' ||
    pricingModel === 'reserved-3yr' ||
    pricingModel === 'savings-plan' ||
    pricingModel === 'spot'
  ) {
    return pricingModel;
  }

  throw new ApiValidationError('Unsupported share-link pricing model', [
    {
      field: 'pricingModel',
      issue: 'must be on-demand, reserved-1yr, reserved-3yr, savings-plan, or spot',
    },
  ]);
}

function parseShareGranularity(value: unknown): ShareLinkInput['granularity'] {
  const granularity = parseRequiredString(value, 'granularity');

  if (
    granularity === 'hourly' ||
    granularity === 'daily' ||
    granularity === 'weekly' ||
    granularity === 'monthly' ||
    granularity === 'quarterly' ||
    granularity === 'yearly'
  ) {
    return granularity;
  }

  throw new ApiValidationError('Unsupported share-link granularity', [
    {
      field: 'granularity',
      issue: 'must be hourly, daily, weekly, monthly, quarterly, or yearly',
    },
  ]);
}

function parseDismissedUpdate(body: unknown): boolean {
  const record = requireRecord(body, 'Alert update body must be an object');

  if (typeof record.dismissed !== 'boolean') {
    throw new ApiValidationError('dismissed must be a boolean', [
      {
        field: 'dismissed',
        issue: 'must be a boolean',
      },
    ]);
  }

  return record.dismissed;
}

function parseInstanceFamily(value: unknown): WorkloadInput['instanceFamily'] {
  const family = parseRequiredString(value, 'instanceFamily');

  if (!INSTANCE_FAMILIES.includes(family as WorkloadInput['instanceFamily'])) {
    throw new ApiValidationError('Unsupported instanceFamily', [
      {
        field: 'instanceFamily',
        issue: `must be one of ${INSTANCE_FAMILIES.join(', ')}`,
      },
    ]);
  }

  return family as WorkloadInput['instanceFamily'];
}

function parseStorageTier(value: unknown): StoragePricingTier {
  const tier = parseRequiredString(value, 'storageTier');

  if (!STORAGE_TIERS.includes(tier as StoragePricingTier)) {
    throw new ApiValidationError('Unsupported storageTier', [
      {
        field: 'storageTier',
        issue: `must be one of ${STORAGE_TIERS.join(', ')}`,
      },
    ]);
  }

  return tier as StoragePricingTier;
}

function parsePricingTerm(value: unknown): CachedPricingTerm {
  const term = optionalSingleString(value) ?? 'on_demand';

  if (!PRICING_TERMS.includes(term as CachedPricingTerm)) {
    throw new ApiValidationError('Unsupported pricing term', [
      {
        field: 'term',
        issue: `must be one of ${PRICING_TERMS.join(', ')}`,
      },
    ]);
  }

  return term as CachedPricingTerm;
}

function pricingModelCatalog(): PricingModelCatalogResponse {
  return {
    defaultModel: 'on-demand',
    generatedAt: new Date().toISOString(),
    models: [
      {
        model: 'on-demand',
        cachedTerm: 'on_demand',
        label: 'On-demand',
        default: true,
        volatility: 'stable',
        providerTerms: {
          aws: 'On-Demand Instances',
          azure: 'Pay as you go',
          gcp: 'On-demand pricing',
        },
        caveat: 'No usage commitment is modeled.',
      },
      {
        model: 'reserved-1yr',
        cachedTerm: 'reserved_1yr',
        label: 'Reserved 1 year',
        default: false,
        volatility: 'stable',
        providerTerms: {
          aws: 'EC2 Reserved Instances 1yr',
          azure: 'Azure Reserved VM Instances 1yr',
          gcp: 'Google Cloud CUDs 1yr',
        },
        caveat: 'Payment option and SKU availability vary by provider.',
      },
      {
        model: 'reserved-3yr',
        cachedTerm: 'reserved_3yr',
        label: 'Reserved 3 year',
        default: false,
        volatility: 'stable',
        providerTerms: {
          aws: 'EC2 Reserved Instances 3yr',
          azure: 'Azure Reserved VM Instances 3yr',
          gcp: 'Google Cloud CUDs 3yr',
        },
        caveat: 'Payment option and SKU availability vary by provider.',
      },
      {
        model: 'spot',
        cachedTerm: 'spot',
        label: 'Spot',
        default: false,
        volatility: 'volatile',
        providerTerms: {
          aws: 'EC2 Spot Instances',
          azure: 'Azure Spot VMs',
          gcp: 'Google Cloud Spot VMs',
        },
        caveat: 'Spot prices are interruptible and volatile; estimates require live validation.',
      },
      {
        model: 'savings-plan',
        cachedTerm: 'savings_plan',
        label: 'Savings / committed use',
        default: false,
        volatility: 'variable',
        providerTerms: {
          aws: 'AWS Savings Plans',
          azure: 'Azure Reservations',
          gcp: 'Committed use discounts',
        },
        caveat: 'Commitment programs are similar but not identical across providers.',
      },
    ],
  };
}

function parseCanonicalRegion(value: unknown): string {
  const region = parseRequiredString(value, 'region');

  if (!providerRegionsForCanonicalRegion(region)) {
    throw new ApiValidationError('Unsupported canonical region', [
      {
        field: 'region',
        issue: `must be one of ${supportedCanonicalRegions().join(', ')}`,
      },
    ]);
  }

  return region;
}

function parseCurrency(value: unknown, field: string): string {
  const currency = parseRequiredString(value, field).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ApiValidationError(`${field} must be an ISO 4217 currency code`, [
      {
        field,
        issue: 'must be a three-letter currency code',
      },
    ]);
  }

  return currency;
}

function parsePositiveNumber(value: unknown, field: string, integer = false): number {
  const parsed = parseNumber(value, field);

  if (parsed <= 0 || (integer && !Number.isInteger(parsed))) {
    throw new ApiValidationError(`${field} must be a positive ${integer ? 'integer' : 'number'}`, [
      {
        field,
        issue: `must be a positive ${integer ? 'integer' : 'number'}`,
      },
    ]);
  }

  return parsed;
}

function parseNonNegativeNumber(value: unknown, field: string): number {
  const parsed = parseNumber(value, field);

  if (parsed < 0) {
    throw new ApiValidationError(`${field} must be non-negative`, [
      {
        field,
        issue: 'must be non-negative',
      },
    ]);
  }

  return parsed;
}

function parseNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isFinite(parsed)) {
    throw new ApiValidationError(`${field} must be a number`, [
      {
        field,
        issue: 'must be a number',
      },
    ]);
  }

  return parsed;
}

function parseRequiredString(value: unknown, field: string): string {
  const parsed = optionalSingleString(value);

  if (!parsed) {
    throw new ApiValidationError(`${field} is required`, [
      {
        field,
        issue: 'is required',
      },
    ]);
  }

  return parsed;
}

function optionalSingleString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim() ? value[0].trim() : undefined;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiValidationError(message);
  }

  return value as Record<string, unknown>;
}
