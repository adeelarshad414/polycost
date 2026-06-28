import { Inject, Injectable } from '@nestjs/common';
import {
  CloudProviderAdapter,
  ProviderId,
  ProviderPricingResult,
} from '../adapters/common/cloud-provider-adapter';
import { NormalizedWorkloadSpec } from '../nws/nws.types';
import { NWSValidator } from '../nws/nws-validator';
import {
  COMPARISON_CLOCK,
  COMPARISON_ID_FACTORY,
  COMPARISON_PROVIDER_ADAPTERS,
  ComparisonClock,
  ComparisonIdFactory,
} from './comparison.tokens';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
  ComparisonWarning,
} from './comparison.types';
import { EquivalentServiceMapper } from './equivalent-service-mapper';
import { IntervalCostCalculator } from './interval-cost-calculator';

interface ProviderSuccess {
  result: ProviderPricingResult;
}

interface ProviderFailure {
  providerId: ProviderId;
  error: unknown;
}

export class ComparisonUnavailableError extends Error {
  constructor(readonly failures: ComparisonWarning[]) {
    super('No provider pricing results were available');
    this.name = 'ComparisonUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@Injectable()
export class ComparisonOrchestratorService {
  constructor(
    @Inject(COMPARISON_PROVIDER_ADAPTERS)
    private readonly adapters: CloudProviderAdapter[],
    private readonly intervalCostCalculator: IntervalCostCalculator,
    private readonly equivalentServiceMapper: EquivalentServiceMapper,
    @Inject(COMPARISON_ID_FACTORY) private readonly idFactory: ComparisonIdFactory,
    @Inject(COMPARISON_CLOCK) private readonly clock: ComparisonClock,
  ) {}

  async compare(input: unknown): Promise<ComparisonResult> {
    const nws = NWSValidator.validate(input);
    const providerOutcomes = await Promise.all(
      this.adapters.map((adapter) => this.priceProvider(adapter, nws)),
    );

    const failures = providerOutcomes.filter(isProviderFailure);
    const providers = providerOutcomes
      .filter(isProviderSuccess)
      .map((success) => this.toComparisonProviderResult(nws, success.result));

    const warnings = failures.map((failure) => this.toWarning(failure));

    if (providers.length === 0) {
      throw new ComparisonUnavailableError(warnings);
    }

    return {
      comparisonId: this.idFactory(),
      pricingAsOf: this.clock().toISOString(),
      providers,
      cheapestProviderId: this.cheapestProvider(providers),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  private async priceProvider(
    adapter: CloudProviderAdapter,
    nws: NormalizedWorkloadSpec,
  ): Promise<ProviderSuccess | ProviderFailure> {
    try {
      return {
        result: await adapter.priceWorkload(nws),
      };
    } catch (error) {
      return {
        providerId: adapter.providerId,
        error,
      };
    }
  }

  private toComparisonProviderResult(
    nws: NormalizedWorkloadSpec,
    result: ProviderPricingResult,
  ): ComparisonProviderResult {
    const lineItems = result.lineItems.map((lineItem): ComparisonLineItem => {
      const annotatedLineItem = this.equivalentServiceMapper.annotateLineItem(
        nws,
        result.providerId,
        lineItem,
      );

      return {
        category: annotatedLineItem.category,
        description: annotatedLineItem.description,
        isApproximate: annotatedLineItem.isApproximate,
        baseMonthlyCostUsd: this.roundCurrency(annotatedLineItem.baseMonthlyCostUsd),
      };
    });

    const monthlyCostUsd = this.roundCurrency(
      lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
    );

    return {
      providerId: result.providerId,
      lineItems,
      totals: this.intervalCostCalculator.calculate(monthlyCostUsd),
    };
  }

  private cheapestProvider(providers: ComparisonProviderResult[]): ProviderId {
    return providers.reduce((cheapest, current) =>
      current.totals.monthly < cheapest.totals.monthly ? current : cheapest,
    ).providerId;
  }

  private toWarning(failure: ProviderFailure): ComparisonWarning {
    return {
      providerId: failure.providerId,
      code: 'provider_pricing_failed',
      message: `${failure.providerId} pricing failed: ${this.safeErrorMessage(failure.error)}`,
    };
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) {
      return error.message;
    }

    return 'Unknown provider pricing error';
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

function isProviderSuccess(outcome: ProviderSuccess | ProviderFailure): outcome is ProviderSuccess {
  return 'result' in outcome;
}

function isProviderFailure(outcome: ProviderSuccess | ProviderFailure): outcome is ProviderFailure {
  return 'error' in outcome;
}
