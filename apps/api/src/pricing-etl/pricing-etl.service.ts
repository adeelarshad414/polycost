import { Injectable, Logger } from '@nestjs/common';
import {
  CloudProviderAdapter,
  PricingCatalogRecord,
} from '../adapters/common/cloud-provider-adapter';
import {
  NormalizedPricingWriter,
  PricingCatalogWriter,
  PricingEtlRunRepository,
} from '../database/pricing-repository.types';
import { PricingSyncFailureNotifier } from './pricing-sync-alert.service';
import { PricingEtlProviderResult, PricingEtlSummary } from './pricing-etl.types';

const MAX_ERROR_DETAIL_LENGTH = 2000;
const PRICING_ETL_MAX_ATTEMPTS = 3;
const PRICING_ETL_BACKOFF_MS = 500;

export interface PricingEtlRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  delay?: (durationMs: number) => Promise<void>;
}

@Injectable()
export class PricingEtlService {
  private readonly logger = new Logger(PricingEtlService.name);

  constructor(
    private readonly adapters: CloudProviderAdapter[],
    private readonly catalogWriter: PricingCatalogWriter,
    private readonly runRepository: PricingEtlRunRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly normalizedPricingWriter?: NormalizedPricingWriter,
    private readonly failureNotifier?: PricingSyncFailureNotifier,
    private readonly retryOptions: PricingEtlRetryOptions = {},
  ) {}

  async refreshAllProviders(): Promise<PricingEtlSummary> {
    const providerResults = await Promise.all(
      this.adapters.map((adapter) => this.refreshProvider(adapter)),
    );

    return {
      status: summarize(providerResults),
      providerResults,
    };
  }

  private async refreshProvider(adapter: CloudProviderAdapter): Promise<PricingEtlProviderResult> {
    const startedAt = this.timestamp();
    let result: PricingEtlProviderResult;

    try {
      const records = await this.refreshCatalogWithRetry(adapter);
      const catalogWriteResult = await this.catalogWriter.upsertPricingRecords(records);
      const normalizedWriteResult = this.normalizedPricingWriter
        ? await this.normalizedPricingWriter.upsertNormalizedPricingRecords(records)
        : { recordsUpdated: 0, recordsRejected: 0, recordsSkipped: 0 };
      const recordsUpdated =
        catalogWriteResult.recordsUpdated + normalizedWriteResult.recordsUpdated;
      const recordsRejected =
        catalogWriteResult.recordsRejected + normalizedWriteResult.recordsRejected;
      const recordsSkipped =
        (catalogWriteResult.recordsSkipped ?? 0) + (normalizedWriteResult.recordsSkipped ?? 0);
      const status = recordsRejected > 0 ? 'partial' : 'success';
      result = {
        provider: adapter.providerId,
        status,
        startedAt,
        completedAt: this.timestamp(),
        recordsUpdated,
        recordsRejected,
        recordsSkipped,
        ...(status === 'partial'
          ? { errorDetail: `${recordsRejected} pricing records were rejected` }
          : {}),
      };
    } catch (error) {
      result = {
        provider: adapter.providerId,
        status: 'failed',
        startedAt,
        completedAt: this.timestamp(),
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
        errorDetail: safeErrorMessage(error),
      };
    }

    await this.runRepository.recordProviderRun({
      provider: result.provider,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      recordsUpdated: result.recordsUpdated,
      recordsRejected: result.recordsRejected,
      recordsSkipped: result.recordsSkipped,
      errorDetail: result.errorDetail,
    });
    await this.notifyPricingSyncIssue(result);

    return result;
  }

  private async refreshCatalogWithRetry(
    adapter: CloudProviderAdapter,
  ): Promise<PricingCatalogRecord[]> {
    const maxAttempts = Math.max(
      1,
      Math.trunc(this.retryOptions.maxAttempts ?? PRICING_ETL_MAX_ATTEMPTS),
    );
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await adapter.refreshPricingCatalog();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          this.logger.warn({
            event: 'pricing_etl_provider_refresh_retry',
            provider: adapter.providerId,
            attempt,
            maxAttempts,
            error: safeErrorMessage(error),
          });
          await this.retryDelay(this.retryBackoffMs(attempt));
        }
      }
    }

    throw lastError;
  }

  private async retryDelay(durationMs: number): Promise<void> {
    await (this.retryOptions.delay ?? delay)(durationMs);
  }

  private retryBackoffMs(attempt: number): number {
    return Math.max(0, this.retryOptions.baseDelayMs ?? PRICING_ETL_BACKOFF_MS) * attempt;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private async notifyPricingSyncIssue(result: PricingEtlProviderResult): Promise<void> {
    if (!this.failureNotifier || result.status === 'success') {
      return;
    }

    try {
      await this.failureNotifier.notifyProviderResult(result);
    } catch (error) {
      this.logger.error({
        event: 'pricing_sync_alert_notification_failed',
        provider: result.provider,
        status: result.status,
        error: error instanceof Error ? error.message : 'Unknown notifier failure',
      });
    }
  }
}

function summarize(results: PricingEtlProviderResult[]): PricingEtlSummary['status'] {
  const failedCount = results.filter((result) => result.status === 'failed').length;
  const partialCount = results.filter((result) => result.status === 'partial').length;

  if (failedCount === 0 && partialCount === 0) {
    return 'success';
  }

  if (failedCount === results.length) {
    return 'failed';
  }

  return 'partial';
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown provider refresh error';
  return message.slice(0, MAX_ERROR_DETAIL_LENGTH);
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
