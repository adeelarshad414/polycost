import { Injectable } from '@nestjs/common';
import { ComparisonOrchestratorService } from '../comparison/comparison-orchestrator.service';
import { ComparisonResult, ComparisonWarning } from '../comparison/comparison.types';
import { NWSValidator } from '../nws/nws-validator';
import { ApiNotFoundError, LiveRefreshUnavailableError } from './api-errors';
import { ApiDatabaseRepository, ComparisonSnapshot } from './api-database.repository';
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

    await this.apiDatabaseRepository.saveComparison(nws, result);
    await this.apiDatabaseRepository.recordComparisonAuditLog(result);

    return result;
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
}

function mergeWarnings(
  result: ComparisonResult,
  liveRefreshWarnings: ComparisonWarning[],
): ComparisonResult {
  if (liveRefreshWarnings.length === 0) {
    return result;
  }

  return {
    ...result,
    warnings: [...(result.warnings ?? []), ...liveRefreshWarnings],
  };
}
