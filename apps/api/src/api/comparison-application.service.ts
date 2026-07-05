import { Injectable } from '@nestjs/common';
import { ComparisonOrchestratorService } from '../comparison/comparison-orchestrator.service';
import { ComparisonResult, ComparisonWarning } from '../comparison/comparison.types';
import { NWSValidator } from '../nws/nws-validator';
import { ApiNotFoundError, DataHealthResponse, LiveRefreshUnavailableError } from './api-errors';
import { ApiDatabaseRepository, ComparisonSnapshot } from './api-database.repository';
import { ComparisonPrewarmService } from './comparison-prewarm.service';
import { LivePricingRefreshService } from './live-pricing-refresh.service';

export interface CreateComparisonOptions {
  useLivePricing?: boolean;
}

@Injectable()
export class ComparisonApplicationService {
  constructor(
    private readonly comparisonOrchestratorService: ComparisonOrchestratorService,
    private readonly apiDatabaseRepository: ApiDatabaseRepository,
    private readonly livePricingRefreshService?: LivePricingRefreshService,
    private readonly comparisonPrewarmService?: ComparisonPrewarmService,
  ) {}

  async createComparison(
    input: unknown,
    options: CreateComparisonOptions = {},
  ): Promise<ComparisonResult> {
    if (options.useLivePricing) {
      throw new LiveRefreshUnavailableError(
        'Live pricing for initial comparisons is not available in this build',
      );
    }

    const nws = NWSValidator.validate(input);
    const result = await this.comparisonOrchestratorService.compare(nws);
    const resultWithHealthWarnings = mergeWarnings(result, await this.dataHealthWarnings());

    await this.apiDatabaseRepository.saveComparison(nws, resultWithHealthWarnings);
    await this.apiDatabaseRepository.recordComparisonAuditLog(resultWithHealthWarnings);
    this.comparisonPrewarmService?.enqueue(resultWithHealthWarnings);

    return resultWithHealthWarnings;
  }

  async getComparison(comparisonId: string): Promise<ComparisonSnapshot> {
    const snapshot = await this.apiDatabaseRepository.getComparison(comparisonId);

    if (!snapshot) {
      throw new ApiNotFoundError(`Comparison ${comparisonId} was not found`);
    }

    return snapshot;
  }

  async refreshLiveComparison(
    comparisonId: string,
    liveRefreshEnabled: boolean,
  ): Promise<ComparisonResult> {
    if (!liveRefreshEnabled) {
      throw new LiveRefreshUnavailableError('Live pricing refresh is disabled for this deployment');
    }

    const snapshot = await this.getComparison(comparisonId);
    const liveRefreshWarnings = this.livePricingRefreshService
      ? await this.livePricingRefreshService.refreshSnapshot(snapshot)
      : [];
    const refreshed = mergeWarnings(
      await this.comparisonOrchestratorService.compare(snapshot.nwsSnapshot),
      liveRefreshWarnings,
      await this.dataHealthWarnings(),
    );

    await this.apiDatabaseRepository.saveComparison(snapshot.nwsSnapshot, refreshed);
    await this.apiDatabaseRepository.recordComparisonAuditLog(refreshed);

    return refreshed;
  }

  async validateNws(input: unknown): Promise<{ valid: true }> {
    NWSValidator.validate(input);
    return {
      valid: true,
    };
  }

  async getPricingStatus() {
    return this.apiDatabaseRepository.getPricingStatus();
  }

  async getDataHealth() {
    return this.apiDatabaseRepository.getDataHealth();
  }

  private async dataHealthWarnings(): Promise<ComparisonWarning[]> {
    try {
      return dataHealthToWarnings(await this.apiDatabaseRepository.getDataHealth());
    } catch (error) {
      return [
        {
          code: 'pricing_data_health',
          message: `Pricing data health could not be verified: ${safeErrorMessage(
            error,
          )}. Treat cached pricing as unverified until health recovers.`,
        },
      ];
    }
  }
}

function mergeWarnings(
  result: ComparisonResult,
  ...warningGroups: ComparisonWarning[][]
): ComparisonResult {
  const warnings = dedupeWarnings([...(result.warnings ?? []), ...warningGroups.flat()]);

  if (warnings.length === 0) {
    return result;
  }

  return {
    ...result,
    warnings,
  };
}

function dataHealthToWarnings(dataHealth: DataHealthResponse): ComparisonWarning[] {
  const warnings = dataHealth.alerts.map((alert) => ({
    ...(alert.providerId ? { providerId: alert.providerId } : {}),
    code: 'pricing_data_health' as const,
    message: alert.message,
  }));

  if (warnings.length > 0 || dataHealth.overallStatus === 'fresh') {
    return warnings;
  }

  return [
    {
      code: 'pricing_data_health',
      message: `Pricing data health is ${dataHealth.overallStatus}; refresh cached pricing before production decisions.`,
    },
  ];
}

function dedupeWarnings(warnings: ComparisonWarning[]): ComparisonWarning[] {
  const seen = new Set<string>();

  return warnings.filter((warning) => {
    const key = `${warning.providerId ?? 'general'}:${warning.code}:${warning.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Unknown data-health failure';
}
