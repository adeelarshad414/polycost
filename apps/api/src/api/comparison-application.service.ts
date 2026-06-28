import { Injectable } from '@nestjs/common';
import { ComparisonOrchestratorService } from '../comparison/comparison-orchestrator.service';
import { ComparisonResult } from '../comparison/comparison.types';
import { NWSValidator } from '../nws/nws-validator';
import { ApiNotFoundError, LiveRefreshUnavailableError } from './api-errors';
import { ApiDatabaseRepository, ComparisonSnapshot } from './api-database.repository';

export interface CreateComparisonOptions {
  useLivePricing?: boolean;
}

@Injectable()
export class ComparisonApplicationService {
  constructor(
    private readonly comparisonOrchestratorService: ComparisonOrchestratorService,
    private readonly apiDatabaseRepository: ApiDatabaseRepository,
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
    const refreshed = await this.comparisonOrchestratorService.compare(snapshot.nwsSnapshot);

    await this.apiDatabaseRepository.saveComparison(snapshot.nwsSnapshot, refreshed);

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
}
