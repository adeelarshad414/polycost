import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { ProviderId } from '../adapters/common/cloud-provider-adapter';
import { AppConfig } from '../config/config.schema';
import { SecretsReader, SecretsService } from '../secrets/secrets.service';
import {
  PaymentOptionCode,
  PricingRateQuery,
  PricingRateReader,
  PricingRateRecord,
  PricingTermCode,
} from './pricing-models.types';

interface QueryResultLike<T> {
  rows: T[];
  rowCount: number | null;
}

interface PgPoolLike {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResultLike<T>>;
  end(): Promise<void>;
}

interface PgPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

type PgPoolFactory = (config: PgPoolConfig) => PgPoolLike;

interface PricingRateSqlRow {
  provider: ProviderId;
  provider_sku_id: string;
  sku_id: string;
  service: string;
  region: string;
  term_code: PricingTermCode;
  payment_option_code: PaymentOptionCode | null;
  hourly_rate_usd: string;
  currency: string;
  is_estimate: boolean;
  estimate_range_low_usd: string | null;
  estimate_range_high_usd: string | null;
  source_fetched_at: Date;
  valid_from: Date;
}

const defaultPgPoolFactory: PgPoolFactory = (config) => new Pool(config);

const SERVICE_FAMILY_ALIASES = new Map<string, string>([
  ['compute', 'general-purpose'],
  ['ec2', 'general-purpose'],
  ['vm', 'general-purpose'],
  ['vms', 'general-purpose'],
  ['virtualmachines', 'general-purpose'],
  ['virtual-machines', 'general-purpose'],
  ['compute-engine', 'general-purpose'],
  ['general-purpose', 'general-purpose'],
  ['general', 'general-purpose'],
  ['compute-optimized', 'compute-optimized'],
  ['computeoptimized', 'compute-optimized'],
  ['memory-optimized', 'memory-optimized'],
  ['memoryoptimized', 'memory-optimized'],
  ['storage-optimized', 'storage-optimized'],
  ['storageoptimized', 'storage-optimized'],
  ['accelerated-computing', 'accelerated-computing'],
  ['accelerated', 'accelerated-computing'],
]);

const PROVIDER_BASELINE_HOURLY_RATE_USD: Record<ProviderId, number> = {
  aws: 0.0416,
  azure: 0.0452,
  gcp: 0.04,
};

@Injectable()
export class PostgresPricingRatesRepository implements PricingRateReader, OnModuleDestroy {
  private pool?: PgPoolLike;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(SecretsService)
    private readonly secretsReader: SecretsReader,
    private readonly poolFactory: PgPoolFactory = defaultPgPoolFactory,
  ) {}

  async findCurrentRate(query: PricingRateQuery): Promise<PricingRateRecord | undefined> {
    try {
      const row = await this.findCurrentRateRow(query);
      return row ? toPricingRateRecord(row) : fallbackPricingRate(query, 'not_cached');
    } catch {
      return fallbackPricingRate(query, 'schema_or_connection_unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async findCurrentRateRow(
    query: PricingRateQuery,
  ): Promise<PricingRateSqlRow | undefined> {
    const serviceFamily = serviceFamilyFromSlug(query.service);
    const result = await (
      await this.getPool()
    ).query<PricingRateSqlRow>(
      `
        SELECT provider_skus.provider,
               provider_skus.provider_sku_id,
               provider_skus.id AS sku_id,
               provider_skus.family AS service,
               provider_skus.region,
               pricing_terms.code AS term_code,
               payment_options.code AS payment_option_code,
               pricing_rates.hourly_rate_usd,
               pricing_rates.currency,
               pricing_rates.is_estimate,
               pricing_rates.estimate_range_low_usd,
               pricing_rates.estimate_range_high_usd,
               pricing_rates.source_fetched_at,
               pricing_rates.valid_from
        FROM provider_skus
        JOIN pricing_rates
          ON pricing_rates.sku_id = provider_skus.id
         AND pricing_rates.region = provider_skus.region
         AND pricing_rates.valid_to IS NULL
        JOIN pricing_terms
          ON pricing_terms.id = pricing_rates.pricing_term_id
        LEFT JOIN payment_options
          ON payment_options.id = pricing_rates.payment_option_id
        WHERE provider_skus.provider = $1
          AND provider_skus.region = $2
          AND provider_skus.family = $3
          AND pricing_terms.code = $4
          AND (
              ($5::text IS NULL AND pricing_rates.payment_option_id IS NULL)
              OR payment_options.code = $5
          )
        ORDER BY provider_skus.vcpu ASC,
                 provider_skus.memory_gb ASC,
                 pricing_rates.valid_from DESC,
                 pricing_rates.hourly_rate_usd ASC
        LIMIT 1
      `,
      [
        query.provider,
        query.region,
        serviceFamily,
        query.termCode,
        query.paymentOptionCode ?? null,
      ],
    );

    return result.rows[0];
  }

  private async getPool(): Promise<PgPoolLike> {
    if (!this.pool) {
      this.pool = this.poolFactory({
        host: this.configService.get('DB_HOST', { infer: true }),
        port: this.configService.get('DB_PORT', { infer: true }),
        database: this.configService.get('DB_NAME', { infer: true }),
        user: await this.secretsReader.getSecret('polycost/db', 'username'),
        password: await this.secretsReader.getSecret('polycost/db', 'password'),
      });
    }

    return this.pool;
  }
}

function toPricingRateRecord(row: PricingRateSqlRow): PricingRateRecord {
  return {
    provider: row.provider,
    service: row.service,
    skuId: row.sku_id,
    providerSkuId: row.provider_sku_id,
    region: row.region,
    termCode: row.term_code,
    ...(row.payment_option_code ? { paymentOptionCode: row.payment_option_code } : {}),
    hourlyRateUsd: Number.parseFloat(row.hourly_rate_usd),
    currency: row.currency,
    isEstimate: row.is_estimate,
    ...(row.estimate_range_low_usd
      ? { estimateRangeLowUsd: Number.parseFloat(row.estimate_range_low_usd) }
      : {}),
    ...(row.estimate_range_high_usd
      ? { estimateRangeHighUsd: Number.parseFloat(row.estimate_range_high_usd) }
      : {}),
    sourceFetchedAt: row.source_fetched_at.toISOString(),
    validFrom: row.valid_from.toISOString(),
    source: 'pricing_rates',
  };
}

function fallbackPricingRate(
  query: PricingRateQuery,
  reasonCode: 'not_cached' | 'schema_or_connection_unavailable',
): PricingRateRecord {
  const hourlyRateUsd = roundRate(
    PROVIDER_BASELINE_HOURLY_RATE_USD[query.provider] * pricingTermFactor(query.termCode),
  );
  const isSpot = query.termCode === 'spot_estimate';
  const now = new Date().toISOString();

  return {
    provider: query.provider,
    service: serviceFamilyFromSlug(query.service),
    skuId: `fallback:${query.provider}:${serviceFamilyFromSlug(query.service)}`,
    providerSkuId: `fallback-${query.provider}-${serviceFamilyFromSlug(query.service)}`,
    region: query.region,
    termCode: query.termCode,
    ...(query.paymentOptionCode ? { paymentOptionCode: query.paymentOptionCode } : {}),
    hourlyRateUsd,
    currency: 'USD',
    isEstimate: true,
    ...(isSpot
      ? {
          estimateRangeLowUsd: roundRate(hourlyRateUsd * 0.8),
          estimateRangeHighUsd: roundRate(hourlyRateUsd * 1.2),
        }
      : {}),
    sourceFetchedAt: now,
    validFrom: now,
    source: 'modeled-estimate',
    unavailableReason:
      reasonCode === 'not_cached'
        ? 'No current pricing_rates row was found for this provider, service, region, term, and payment option.'
        : 'The pricing_rates cache could not be read in this environment; a transparent local estimate is shown instead.',
  };
}

function serviceFamilyFromSlug(service: string): string {
  const normalized = service.toLowerCase().replace(/[^a-z0-9-]/g, '');

  return SERVICE_FAMILY_ALIASES.get(normalized) ?? 'general-purpose';
}

function pricingTermFactor(termCode: PricingTermCode): number {
  switch (termCode) {
    case 'on_demand':
      return 1;
    case 'reserved_1yr':
      return 0.68;
    case 'reserved_3yr':
      return 0.52;
    case 'savings_plan_1yr':
      return 0.72;
    case 'savings_plan_3yr':
      return 0.58;
    case 'spot_estimate':
      return 0.35;
  }
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
