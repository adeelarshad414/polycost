import { ProviderId } from '../adapters/common/cloud-provider-adapter';

export type PricingGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PricingTermCode =
  | 'on_demand'
  | 'reserved_1yr'
  | 'reserved_3yr'
  | 'savings_plan_1yr'
  | 'savings_plan_3yr'
  | 'spot_estimate';

export type PaymentOptionCode = 'no_upfront' | 'partial_upfront' | 'all_upfront' | 'n_a';

export type PricingRateSource = 'pricing_rates' | 'modeled-estimate';

export interface PricingTermDefinition {
  code: PricingTermCode;
  label: string;
  termMonths?: number;
  requiresPaymentOption: boolean;
  isEstimateOnly: boolean;
}

export interface PaymentOptionDefinition {
  code: PaymentOptionCode;
  label: string;
}

export interface PricingRateQuery {
  provider: ProviderId;
  service: string;
  region: string;
  termCode: PricingTermCode;
  paymentOptionCode?: PaymentOptionCode;
}

export interface PricingRateRecord {
  provider: ProviderId;
  service: string;
  skuId: string;
  providerSkuId: string;
  region: string;
  termCode: PricingTermCode;
  paymentOptionCode?: PaymentOptionCode;
  hourlyRateUsd: number;
  currency: string;
  isEstimate: boolean;
  estimateRangeLowUsd?: number;
  estimateRangeHighUsd?: number;
  sourceFetchedAt: string;
  validFrom: string;
  source: PricingRateSource;
  sourceEndpoint?: string;
  sourceRecordId?: string;
  sourceRecordKey?: string;
  transformVersion?: string;
  sourcePayloadHash?: string;
  unavailableReason?: string;
}

export interface PricingRateReader {
  findCurrentRate(query: PricingRateQuery): Promise<PricingRateRecord | undefined>;
}

export interface RateResolverQuery extends PricingRateQuery {
  granularity: PricingGranularity;
}

export interface RateIntervals {
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export interface RateResult {
  schemaVersion: 2;
  provider: ProviderId;
  service: string;
  skuId: string;
  providerSkuId: string;
  region: string;
  pricingTerm: PricingTermDefinition;
  paymentOption?: PaymentOptionDefinition;
  granularity: PricingGranularity;
  hourlyRateUsd: number;
  amountUsd: number;
  currency: string;
  intervals: RateIntervals;
  isEstimate: boolean;
  estimateRangeLowUsd?: number;
  estimateRangeHighUsd?: number;
  lastFetchedAt: string;
  validFrom: string;
  source: PricingRateSource;
  sourceEndpoint?: string;
  sourceRecordId?: string;
  sourceRecordKey?: string;
  transformVersion?: string;
  sourcePayloadHash?: string;
  unavailable?: boolean;
  reason?: string;
  disclaimer?: string;
}

export interface PricingModelsResponse {
  schemaVersion: 2;
  provider: ProviderId;
  service: string;
  region: string;
  generatedAt: string;
  models: Array<
    PricingTermDefinition & {
      paymentOptions: PaymentOptionDefinition[];
      defaultPaymentOption?: PaymentOptionCode;
    }
  >;
}

export interface PricingMatrixResponse {
  schemaVersion: 2;
  provider: ProviderId;
  service: string;
  region: string;
  generatedAt: string;
  matrix: RateResult[];
}

export interface PricingCompareV2Response {
  schemaVersion: 2;
  generatedAt: string;
  services: string[];
  granularity: PricingGranularity;
  pricingModel: PricingTermCode;
  paymentOption?: PaymentOptionCode;
  providers: Array<{
    provider: ProviderId;
    service: string;
    region: string;
    rate: RateResult;
  }>;
}
