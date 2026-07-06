export const POLYCOST_AI_NATIVE_SCHEMA_VERSION = '2026-07-01.phase1' as const;

export type PolycostAiNativeSchemaVersion = typeof POLYCOST_AI_NATIVE_SCHEMA_VERSION;

export type ProviderId = 'aws' | 'azure' | 'gcp';

export type RequirementInputSource =
  | 'natural_language'
  | 'guided_form'
  | 'csv_import'
  | 'excel_import'
  | 'drawio_diagram'
  | 'terraform';

export type NormalizedRequirementCategory =
  | 'compute'
  | 'containers'
  | 'application'
  | 'storage'
  | 'database'
  | 'analytics'
  | 'ai'
  | 'integration'
  | 'networking'
  | 'security'
  | 'operations'
  | 'devops'
  | 'migration'
  | 'edge'
  | 'business';

export type RequirementEquivalenceConfidence = 'high' | 'moderate' | 'low';

export interface NormalizedRequirement {
  schemaVersion: PolycostAiNativeSchemaVersion;
  source: RequirementInputSource;
  requirementId: string;
  serviceCategory: NormalizedRequirementCategory;
  serviceType: string;
  config: Record<string, string | number | boolean>;
  region?: string;
  az?: string;
  quantity: number;
  scaleParams?: Record<string, string | number | boolean>;
  notes?: string;
}

export interface ProviderServiceMapping {
  providerId: ProviderId;
  providerServiceName: string;
  providerSkuHint?: string;
  region?: string;
  confidence: RequirementEquivalenceConfidence;
  caveat?: string;
}

export type PricingGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type PricingModel = 'on-demand' | 'reserved-1yr' | 'reserved-3yr' | 'savings-plan' | 'spot';

export interface ProviderCostResult {
  schemaVersion: PolycostAiNativeSchemaVersion;
  providerId: ProviderId;
  pricingModel: PricingModel;
  granularity: PricingGranularity;
  totalUsd: number;
  isEstimate: boolean;
  lineItems: Array<{
    requirementId?: string;
    serviceCategory: NormalizedRequirementCategory;
    description: string;
    amountUsd: number;
    isEstimate: boolean;
    unavailableReason?: string;
  }>;
}

export interface AiCostNarrative {
  schemaVersion: PolycostAiNativeSchemaVersion;
  generatedBy: 'llm' | 'template';
  summary: string;
  cheapestProviderId?: ProviderId;
  biggestCostDriver?: string;
  savingsOpportunity?: string;
  caveats: string[];
}

export interface RequirementParserService<Input = unknown> {
  parse(input: Input): Promise<NormalizedRequirement[]> | NormalizedRequirement[];
}
