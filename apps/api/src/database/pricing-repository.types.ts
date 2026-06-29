import { PricingCatalogRecord, ProviderId } from '../adapters/common/cloud-provider-adapter';

export type PricingEtlProviderStatus = 'success' | 'partial' | 'failed';

export interface PricingCatalogWriteResult {
  recordsUpdated: number;
  recordsRejected: number;
  recordsSkipped?: number;
}

export interface PricingCatalogWriter {
  upsertPricingRecords(records: PricingCatalogRecord[]): Promise<PricingCatalogWriteResult>;
}

export interface NormalizedPricingWriter {
  upsertNormalizedPricingRecords(
    records: PricingCatalogRecord[],
  ): Promise<PricingCatalogWriteResult>;
}

export interface PricingEtlRunRecord {
  provider: ProviderId;
  startedAt: string;
  completedAt: string;
  status: PricingEtlProviderStatus;
  recordsUpdated: number;
  recordsRejected: number;
  recordsSkipped: number;
  errorDetail?: string;
}

export interface PricingEtlRunRepository {
  recordProviderRun(run: PricingEtlRunRecord): Promise<void>;
}
