import { Injectable } from '@nestjs/common';
import { HOURS_PER_MONTH, hourlyFromMonthly, roundCurrency } from '../cost-time';
import { ComparisonOrchestratorService } from '../comparison/comparison-orchestrator.service';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
  ComparisonWarning,
} from '../comparison/comparison.types';
import { NWSValidator } from '../nws/nws-validator';
import { ApiNotFoundError, DataHealthResponse, LiveRefreshUnavailableError } from './api-errors';
import { ApiDatabaseRepository, ComparisonSnapshot } from './api-database.repository';
import { ComparisonPrewarmService } from './comparison-prewarm.service';
import { LivePricingRefreshService } from './live-pricing-refresh.service';

export interface CreateComparisonOptions {
  useLivePricing?: boolean;
}

export interface ComparisonPricingEvidenceResponse {
  comparisonId: string;
  pricingAsOf: string;
  generatedAt: string;
  providerCount: number;
  lineItemCount: number;
  evidence: ComparisonPricingEvidenceRow[];
}

export interface ComparisonPricingEvidenceRow {
  evidenceId: string;
  providerId: ComparisonProviderResult['providerId'];
  lineItemIndex: number;
  category: ComparisonLineItem['category'];
  costComponent?: ComparisonLineItem['costComponent'];
  description: string;
  displayedAmounts: {
    monthlyCostUsd: number;
    hourlyCostUsd?: number;
    providerTotals: ComparisonProviderResult['totals'];
  };
  sku: {
    resolvedSkuId?: string;
    sourceSkuId?: string;
    rateSourceSkuId?: string;
    providerServiceName?: string;
    skuDescription?: string;
    region?: string;
    catalogRegion?: string;
  };
  rate: {
    source: string;
    sourceRecordKey: string;
    sourceEndpoint?: string;
    sourceRecordId?: string;
    transformVersion?: string;
    sourcePayloadHash?: string;
    unit?: string;
    unitPriceUsd?: number;
    currency?: string;
    effectiveDate?: string;
    fetchedAt?: string;
    pricingTermCode?: string;
    paymentOptionCode?: string;
    pricingBasis?: ComparisonLineItem['pricingBasis'];
  };
  derivation: {
    expression: string;
    quantity?: number;
    unitPriceUsd?: number;
    hourlyCostUsd?: number;
    monthlyCostUsd: number;
    monthlyHours?: number;
  };
  equivalence: {
    confidence: 'direct' | 'approximate' | 'modeled';
    isApproximate: boolean;
    isEstimate: boolean;
  };
  egressTiers?: ComparisonLineItem['egressTiers'];
  pricingModels?: ComparisonLineItem['pricingModels'];
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

  async getComparisonPricingEvidence(
    comparisonId: string,
  ): Promise<ComparisonPricingEvidenceResponse> {
    const snapshot = await this.getComparison(comparisonId);

    return comparisonPricingEvidence(snapshot.resultSnapshot);
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

function comparisonPricingEvidence(result: ComparisonResult): ComparisonPricingEvidenceResponse {
  const evidence = result.providers.flatMap((provider) =>
    provider.lineItems.map((lineItem, lineItemIndex) =>
      lineItemPricingEvidence(
        result.comparisonId,
        result.pricingAsOf,
        provider,
        lineItem,
        lineItemIndex,
      ),
    ),
  );

  return {
    comparisonId: result.comparisonId,
    pricingAsOf: result.pricingAsOf,
    generatedAt: new Date().toISOString(),
    providerCount: result.providers.length,
    lineItemCount: evidence.length,
    evidence,
  };
}

function lineItemPricingEvidence(
  comparisonId: string,
  pricingAsOf: string,
  provider: ComparisonProviderResult,
  lineItem: ComparisonLineItem,
  lineItemIndex: number,
): ComparisonPricingEvidenceRow {
  const trace = lineItem.pricingTrace;
  const source = trace?.source ?? lineItem.rateSource ?? 'manual_model';
  const sourceRecordKey =
    trace?.sourceRecordKey ??
    [
      comparisonId,
      provider.providerId,
      lineItem.category,
      lineItem.skuId ?? lineItem.rateSourceSkuId ?? `line-${lineItemIndex}`,
      pricingAsOf,
    ].join('|');
  const monthlyCostUsd = roundCurrency(lineItem.baseMonthlyCostUsd);
  const hourlyCostUsd =
    lineItem.baseHourlyCostUsd ??
    trace?.derivation?.hourlyCostUsd ??
    roundCurrency(hourlyFromMonthly(monthlyCostUsd));
  const region = lineItem.region ?? trace?.region;
  const unit = lineItem.unit ?? trace?.unit;
  const unitPriceUsd = lineItem.unitPriceUsd ?? trace?.unitPriceUsd;
  const currency = lineItem.rateCurrency ?? trace?.currency;
  const effectiveDate = lineItem.rateValidFrom ?? trace?.effectiveDate;
  const fetchedAt = lineItem.rateSourceFetchedAt ?? trace?.fetchedAt;
  const pricingTermCode = lineItem.pricingTermCode ?? trace?.pricingTermCode;
  const paymentOptionCode = lineItem.paymentOptionCode ?? trace?.paymentOptionCode;
  const pricingBasis = lineItem.pricingBasis ?? trace?.pricingBasis;

  return {
    evidenceId: `${provider.providerId}:${lineItemIndex}:${sourceRecordKey}`,
    providerId: provider.providerId,
    lineItemIndex,
    category: lineItem.category,
    ...(lineItem.costComponent ? { costComponent: lineItem.costComponent } : {}),
    description: lineItem.description,
    displayedAmounts: {
      monthlyCostUsd,
      hourlyCostUsd,
      providerTotals: provider.totals,
    },
    sku: {
      ...(lineItem.skuId ? { resolvedSkuId: lineItem.skuId } : {}),
      ...(trace?.sourceSkuId ? { sourceSkuId: trace.sourceSkuId } : {}),
      ...(lineItem.rateSourceSkuId ? { rateSourceSkuId: lineItem.rateSourceSkuId } : {}),
      ...(trace?.providerServiceName ? { providerServiceName: trace.providerServiceName } : {}),
      ...(trace?.skuDescription ? { skuDescription: trace.skuDescription } : {}),
      ...(region ? { region } : {}),
      ...(trace?.catalogRegion ? { catalogRegion: trace.catalogRegion } : {}),
    },
    rate: {
      source,
      sourceRecordKey,
      ...(trace?.sourceEndpoint ? { sourceEndpoint: trace.sourceEndpoint } : {}),
      ...(trace?.sourceRecordId ? { sourceRecordId: trace.sourceRecordId } : {}),
      ...(trace?.transformVersion ? { transformVersion: trace.transformVersion } : {}),
      ...(trace?.sourcePayloadHash ? { sourcePayloadHash: trace.sourcePayloadHash } : {}),
      ...(unit ? { unit } : {}),
      ...(unitPriceUsd !== undefined ? { unitPriceUsd } : {}),
      ...(currency ? { currency } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(fetchedAt ? { fetchedAt } : {}),
      ...(pricingTermCode ? { pricingTermCode } : {}),
      ...(paymentOptionCode ? { paymentOptionCode } : {}),
      ...(pricingBasis ? { pricingBasis } : {}),
    },
    derivation: trace?.derivation
      ? {
          expression: trace.derivation.expression,
          quantity: trace.derivation.quantity,
          ...(trace.derivation.unitPriceUsd !== undefined
            ? { unitPriceUsd: trace.derivation.unitPriceUsd }
            : {}),
          ...(trace.derivation.hourlyCostUsd !== undefined
            ? { hourlyCostUsd: trace.derivation.hourlyCostUsd }
            : {}),
          monthlyCostUsd: trace.derivation.monthlyCostUsd,
          ...(trace.derivation.monthlyHours !== undefined
            ? { monthlyHours: trace.derivation.monthlyHours }
            : {}),
        }
      : {
          expression: `${hourlyCostUsd.toFixed(6)} hourly USD x ${HOURS_PER_MONTH} monthly hours`,
          hourlyCostUsd,
          monthlyCostUsd,
          monthlyHours: HOURS_PER_MONTH,
        },
    equivalence: {
      confidence:
        trace?.equivalenceConfidence ?? (lineItem.isApproximate ? 'approximate' : 'direct'),
      isApproximate: lineItem.isApproximate,
      isEstimate: trace?.isEstimate ?? (source === 'modeled_estimate' || source === 'manual_model'),
    },
    ...(lineItem.egressTiers ? { egressTiers: lineItem.egressTiers } : {}),
    ...(lineItem.pricingModels ? { pricingModels: lineItem.pricingModels } : {}),
  };
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
