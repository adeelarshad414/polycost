import { PricingCatalogRecord, ProviderId } from '../adapters/common/cloud-provider-adapter.js';

export type PricingEtlProviderStatus = 'success' | 'partial' | 'failed';

export interface PricingCatalogWriteResult {
  recordsUpdated: number;
  recordsRejected: number;
  recordsSkipped?: number;
}

export interface PricingCatalogWriter {
  upsertPricingRecords(records: PricingCatalogRecord[]): Promise<PricingCatalogWriteResult>;
  /**
   * Removes live (provider-fetched) catalog rows for a provider that are older
   * than the given fetch generation, i.e. SKUs that were not returned by the
   * latest successful refresh (discontinued or now filtered out, e.g. Azure
   * Spot meters). Seed and mock rows are preserved as fallback data. Returns the
   * number of rows removed. Optional so lightweight test writers need not
   * implement it.
   */
  pruneStaleLiveRows?(provider: ProviderId, fetchedAt: string): Promise<PruneStaleLiveRowsResult>;
}

export interface PruneStaleLiveRowsResult {
  /** Rows deleted; 0 when the guard skipped the prune. */
  pruned: number;
  /** Live rows stamped by this run. */
  fresh: number;
  /** Live rows from earlier runs, i.e. the prune candidates. */
  stale: number;
  /** True when fresh / (fresh + stale) was below the configured minimum. */
  skipped: boolean;
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
