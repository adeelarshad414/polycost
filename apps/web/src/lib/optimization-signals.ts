// Advisory / optimization signal builders extracted from App.tsx (H-F1, slice 3).
//
// Unblocked by moving the static catalogs into lib/app-catalogs: these helpers
// were pinned inside App.tsx only because they read those lookup tables. They
// remain pure - no JSX, no hooks, no App state.

/* eslint-disable security/detect-object-injection -- Reviewed: typed
   provider/category lookup maps carried over verbatim from App.tsx. */

import { HOURS_PER_MONTH, intervalMultiplierFromMonthly } from '../cost-time';
import { APP_PLATFORM_MODEL_RATES, AUTH_SESSION_EXPIRES_AT_STORAGE_KEY, AUTH_SESSION_STORAGE_KEY, COMPARISON_HISTORY_STORAGE_KEY, COMPUTE_ARM_COST_FACTORS, COMPUTE_STORAGE_DEFAULTS, DIAGRAM_REVIEW_SERVICE_OPTIONS, INPUT_MODE_OPTIONS, PRICING_MODEL_OPTIONS, PRICING_MODEL_STORAGE_KEY, REGION_VARIANCE_PROFILES, REQUIREMENTS_FILE_EXTENSIONS, REQUIREMENTS_FILE_MIME_TYPES, REQUIREMENT_SESSION_STORAGE_KEY, SERVERLESS_FUNCTION_RATES, SERVICE_CATEGORIES, SERVICE_FAMILY_ALIASES, SPOT_ESTIMATE_TOOLTIP, STORAGE_CLASS_OPTIONS } from './app-catalogs';
import { ArchitectureRiskFlag, BreakEvenTimelineModel, CategoryCostSummary, ComparisonHistoryEntry, ComparisonLineItem, ComputeSizingIntent, ComputeStorageDefault, CostComponent, CostMatrixCell, ExecutiveDecision, FullCostMatrixRow, InputMode, OperationsOptimizationRow, ProviderCostSummary, ProviderDeltaRow, RegionVarianceRow, RuntimeOptimizationRow, ServiceCategory, SolutionArchitectureReview, SpotBlendOptimizerRow, StoredRequirementSession } from './app-view-types';
import { chartPoint, comparisonHistorySummary, confidenceDetail, costComponentForCategory, costMatrixCellForLineItem, dataHealthProviderIssueLabel, databaseDimensionTotals, decisionConfidence, finOpsRiskSeverity, formatCompactInput, lineItemCostComponent, lineItemTierBillableGb, manualAssumptionsForService, memoryGbFromTokens, missingCostMatrixCell, numberNearToken, operationsIntelligenceLineItems, operationsOptimizationSignal, runtimeIntelligenceLineItems, runtimeOptimizationSignal, serviceFamilyOptionLabel, serviceFamilySearchText, solutionArchitecturePosture, solutionArchitectureRisk, spotBlendWorkloadFit, spotInterruptionFrequency, tokenizeSizingQuery } from './comparison-models';
import { formatCurrency, formatPercent } from './format';
import { capitalize, databaseDescriptionMatches, formatDecimal, intervalCostMultiplier, networkDescriptionMatches, normalizeServiceSearchText, operationsAdvancedDescriptionMatches, parseFormNumber, parseInputNumber, positiveFormNumber, providerLabel, providerServicesForFamily, roundCurrency, runtimeAdvancedDescriptionMatches, spotBlendPercent, spotBlendRisk, storageDescriptionMatches, supportTierLabel, tierFromSizingQuery } from './workload-analysis';
import { COMPARISON_REGION_GROUPS, canonicalRegionForRegionPreference, canonicalRegionsForResidencyScope, providerRegionSummary } from '../region-normalization';
import { CLOUD_SERVICE_CATALOG, CloudServiceFamily } from '../service-catalog';
import { ComparisonAnalyticsResponse, ComparisonProviderResult, ComparisonResult, DataHealthResponse, DiagramParseResult, IntervalKey, PROVIDER_ORDER, PricingModelKey, ProviderId, ServiceRequirement } from '../types';
import { WorkloadFormState, serviceRequirementsFromForm } from '../workload';

export function dataHealthBannerSummary(
  health: DataHealthResponse | null,
  error: string | null,
  currentRateRows: number,
): string {
  if (error) {
    return 'Pricing data health unavailable';
  }

  if (!health) {
    return 'Pricing data health pending';
  }

  if (health.overallStatus === 'fresh') {
    return `Pricing cache fresh across ${health.providers.length} providers · ${currentRateRows} current rates`;
  }

  const affectedProviders = health.providers.filter(
    (provider) => provider.freshness !== 'fresh' || provider.status !== 'success',
  );
  const affectedSummary =
    affectedProviders.length > 0
      ? affectedProviders.map(dataHealthProviderIssueLabel).join(', ')
      : `${health.alertCount} pricing data alert${health.alertCount === 1 ? '' : 's'}`;

  return `${affectedSummary} · refresh before final commitment`;
}

export function shouldApplyComputeStorageDefault(form: WorkloadFormState): boolean {
  const currentStorageSize = form.storageSizeGb.trim();

  return (
    !form.storageEnabled ||
    currentStorageSize.length === 0 ||
    Object.values(COMPUTE_STORAGE_DEFAULTS).some(
      (storageDefault) => storageDefault.sizeGb === currentStorageSize,
    )
  );
}

export function computeStorageDefaultForTier(
  tier: WorkloadFormState['instanceTier'],
): ComputeStorageDefault {
  switch (tier) {
    case 'small':
      return COMPUTE_STORAGE_DEFAULTS.small;
    case 'balanced':
      return COMPUTE_STORAGE_DEFAULTS.balanced;
    case 'compute':
      return COMPUTE_STORAGE_DEFAULTS.compute;
    case 'memory':
      return COMPUTE_STORAGE_DEFAULTS.memory;
    case 'storage':
      return COMPUTE_STORAGE_DEFAULTS.storage;
    case 'accelerated':
      return COMPUTE_STORAGE_DEFAULTS.accelerated;
    case 'custom':
      return COMPUTE_STORAGE_DEFAULTS.custom;
  }
}

export function computeSizingIntent(query: string, form: WorkloadFormState): ComputeSizingIntent {
  const lower = query.toLowerCase();
  const tokens = tokenizeSizingQuery(lower);
  const fallbackVcpu = positiveFormNumber(form.vcpu) ?? 2;
  const fallbackMemoryGb = positiveFormNumber(form.memoryGb) ?? 4;
  const vcpu =
    numberNearToken(tokens, ['vcpu', 'vcpus', 'core', 'cores', 'cpu', 'cpus']) ?? fallbackVcpu;
  const memoryGb = memoryGbFromTokens(tokens) ?? fallbackMemoryGb;

  return {
    vcpu,
    memoryGb,
    tier: tierFromSizingQuery(lower),
  };
}

export function matchServiceFamily(query: string): CloudServiceFamily | undefined {
  const normalizedQuery = normalizeServiceSearchText(query);

  if (!normalizedQuery) {
    return undefined;
  }

  const aliasId = SERVICE_FAMILY_ALIASES[normalizedQuery];
  if (aliasId) {
    return CLOUD_SERVICE_CATALOG.find((family) => family.id === aliasId);
  }

  return (
    CLOUD_SERVICE_CATALOG.find((family) =>
      [
        family.id,
        family.label,
        ...PROVIDER_ORDER.flatMap((providerId) => providerServicesForFamily(family, providerId)),
      ]
        .map(normalizeServiceSearchText)
        .some((candidate) => candidate === normalizedQuery),
    ) ??
    CLOUD_SERVICE_CATALOG.find((family) =>
      normalizeServiceSearchText(serviceFamilySearchText(family)).includes(normalizedQuery),
    )
  );
}

export function serviceFamilyOptions(categoryId: string): Array<[string, string]> {
  return CLOUD_SERVICE_CATALOG.filter((family) => family.categoryId === categoryId).map(
    (family) => [family.id, serviceFamilyOptionLabel(family)],
  );
}

export function formSizingSummary(
  form: WorkloadFormState,
): Record<'profile' | 'traffic' | 'compute' | 'scale' | 'services' | 'data', string> {
  const dailyUsers = formatCompactInput(form.dailyActiveUsers);
  const peakUsers = formatCompactInput(form.peakConcurrentUsers);
  const vcpu = parseFormNumber(form.vcpu) ?? 0;
  const memory = parseFormNumber(form.memoryGb) ?? 0;
  const instances = parseFormNumber(form.instanceCount) ?? 0;
  const scaleMin = parseFormNumber(form.autoscaleMin) ?? instances;
  const scaleMax = parseFormNumber(form.autoscaleMax) ?? instances;
  const totalVcpu = vcpu * Math.max(instances, 1);
  const totalMemory = memory * Math.max(instances, 1);
  const storageText = form.storageEnabled
    ? `${formatCompactInput(form.storageSizeGb)}GB`
    : 'No storage';
  const databaseText = form.databaseEnabled ? form.databaseEngine : 'No database';
  const selectedServiceCount = new Set([
    form.selectedServiceFamilyId,
    ...form.selectedServiceFamilyIds,
  ]).size;

  return {
    profile: `${capitalize(form.environment)} / ${supportTierLabel(form.supportTier)}`,
    traffic: `${dailyUsers} daily / ${peakUsers} peak`,
    compute: `${formatDecimal(totalVcpu)} vCPU / ${formatDecimal(totalMemory)}GB`,
    scale:
      form.scalingType === 'autoscaling'
        ? `${formatDecimal(scaleMin)}-${formatDecimal(scaleMax)} nodes`
        : `${formatDecimal(instances)} fixed`,
    services: `${selectedServiceCount}/${CLOUD_SERVICE_CATALOG.length} families`,
    data: `${storageText} / ${databaseText}`,
  };
}

export function serverBreakEvenTimelineModel(
  timelines: ComparisonAnalyticsResponse['commitmentRoiTimelines'] | undefined,
  preferredProviderId: ProviderId | undefined,
): BreakEvenTimelineModel | null {
  const selected = [...(timelines ?? [])]
    .filter((timeline) => timeline.monthlySavingsUsd > 0 && timeline.points.length > 0)
    .sort((left, right) => {
      const preferredDelta =
        Number(right.providerId === preferredProviderId) -
        Number(left.providerId === preferredProviderId);

      return (
        preferredDelta ||
        right.monthlySavingsUsd - left.monthlySavingsUsd ||
        left.committedMonthlyUsd - right.committedMonthlyUsd
      );
    })[0];

  if (!selected) {
    return null;
  }

  const horizonMonths = Math.max(
    12,
    selected.breakEvenMonth ?? 0,
    ...selected.points.map((point) => point.month),
  );
  const points = [
    {
      month: 0,
      onDemandCumulativeUsd: 0,
      committedCumulativeUsd: selected.upfrontCostUsd,
    },
    ...selected.points,
  ];
  const yMax = roundCurrency(
    Math.max(
      ...points.flatMap((point) => [point.onDemandCumulativeUsd, point.committedCumulativeUsd]),
    ) * 1.08,
  );
  const pointFor = (month: number, cost: number) => chartPoint(month, cost, horizonMonths, yMax);
  const breakEvenMonth = selected.breakEvenMonth ?? 0;

  return {
    providerId: selected.providerId,
    providerLabel: providerLabel(selected.providerId),
    pricingLabel: selected.label,
    horizonMonths,
    breakEvenMonth,
    yMax,
    onDemandMonthly: selected.baselineMonthlyUsd,
    committedMonthly: selected.committedMonthlyUsd,
    monthlySavings: selected.monthlySavingsUsd,
    upfront: selected.upfrontCostUsd,
    onDemandPoints: points
      .map((point) => pointFor(point.month, point.onDemandCumulativeUsd))
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
    committedPoints: points
      .map((point) => pointFor(point.month, point.committedCumulativeUsd))
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
    breakEvenPoint:
      breakEvenMonth > 0 && breakEvenMonth <= horizonMonths
        ? pointFor(breakEvenMonth, selected.baselineMonthlyUsd * breakEvenMonth)
        : undefined,
  };
}

export function componentMonthlyTotal(
  provider: ComparisonProviderResult,
  component: CostComponent,
): number {
  return roundCurrency(
    provider.lineItems
      .filter(
        (lineItem) =>
          (lineItem.costComponent ?? costComponentForCategory(lineItem.category)) === component,
      )
      .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
  );
}

export function fullCostMatrixRows(comparison: ComparisonResult | null): FullCostMatrixRow[] {
  if (!comparison) {
    return [];
  }

  const providersById = new Map<ProviderId, ComparisonProviderResult>(
    comparison.providers.map((provider) => [provider.providerId, provider]),
  );
  const rowCount = Math.max(
    ...comparison.providers.map((provider) => provider.lineItems.length),
    0,
  );

  return Array.from({ length: rowCount }, (_, index) => {
    const firstLineItem = PROVIDER_ORDER.map((providerId) =>
      providersById.get(providerId)?.lineItems.at(index),
    ).find((lineItem): lineItem is ComparisonLineItem => Boolean(lineItem));
    const category = firstLineItem?.category ?? 'compute';
    const service = firstLineItem
      ? `${capitalize(firstLineItem.category)} - ${firstLineItem.description}`
      : `Service row ${index + 1}`;
    const sortCosts: FullCostMatrixRow['sortCosts'] = [];
    let approximate = firstLineItem?.isApproximate ?? false;
    const providerModelCosts = PROVIDER_ORDER.map((providerId) => {
      const lineItem = providersById.get(providerId)?.lineItems.at(index);

      if (lineItem) {
        approximate = approximate || lineItem.isApproximate;
        sortCosts.push({ providerId, monthlyCostUsd: lineItem.baseMonthlyCostUsd });
      }

      return {
        providerId,
        modelCosts: PRICING_MODEL_OPTIONS.map((model) => ({
          pricingModel: model.key,
          cell: lineItem
            ? costMatrixCellForLineItem(lineItem, model.key)
            : missingCostMatrixCell('No matching service line item in this provider response.'),
        })),
      };
    });

    return {
      key: `${index}-${category}-${service}`,
      service,
      category,
      approximate,
      sortCosts,
      providerModelCosts,
    };
  });
}

export function costMatrixCellFromRow(
  row: FullCostMatrixRow,
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): CostMatrixCell {
  return (
    row.providerModelCosts
      .find((provider) => provider.providerId === providerId)
      ?.modelCosts.find((model) => model.pricingModel === pricingModel)?.cell ??
    missingCostMatrixCell('Pricing model unavailable for this row.')
  );
}

export function isPricingModelKey(value: string): value is PricingModelKey {
  return PRICING_MODEL_OPTIONS.some((model) => model.key === value);
}

export function pricingModelTooltip(pricingModel: PricingModelKey): string {
  switch (pricingModel) {
    case 'on-demand':
      return 'On-demand pricing keeps the workload fully flexible with no usage commitment.';
    case 'reserved-1yr':
      return 'Reserved 1yr pricing models a one-year commitment; lower recurring cost with less flexibility than on-demand.';
    case 'reserved-3yr':
      return 'Reserved 3yr pricing models a three-year commitment; usually lower recurring cost with the least flexibility.';
    case 'savings-plan':
      return 'Savings or committed-use pricing models provider commitment programs; verify eligible services, term, and payment option before procurement.';
    case 'spot':
      return `Spot pricing models interruptible capacity. ${SPOT_ESTIMATE_TOOLTIP}`;
  }
}

export function serviceCheapestRows(
  comparison: ComparisonResult | null,
  interval: IntervalKey,
): Array<{
  category: ServiceCategory;
  providerId?: ProviderId;
  cost?: number;
  coverage: string;
  caveat: string;
}> {
  return SERVICE_CATEGORIES.map((category) => {
    const candidates =
      comparison?.providers
        .map((provider) => {
          const categoryCost = provider.lineItems
            .filter((lineItem) => lineItem.category === category)
            .reduce(
              (sum, lineItem) =>
                sum + lineItem.baseMonthlyCostUsd * intervalMultiplierFromMonthly(interval),
              0,
            );
          const approximate = provider.lineItems.some(
            (lineItem) => lineItem.category === category && lineItem.isApproximate,
          );

          return {
            providerId: provider.providerId,
            cost: categoryCost,
            approximate,
          };
        })
        .filter((candidate) => candidate.cost > 0) ?? [];
    const cheapest = [...candidates].sort((left, right) => left.cost - right.cost)[0];

    return {
      category,
      providerId: cheapest?.providerId,
      cost: cheapest?.cost,
      coverage: `${candidates.length}/3 providers`,
      caveat: cheapest
        ? cheapest.approximate
          ? 'Approximate service mapping; validate fit.'
          : 'Exact mapped line item.'
        : 'No priced line item for this service.',
    };
  });
}

export function computeArchitectureDelta(
  providerId: ProviderId,
  computeMonthly: number,
  architecture: WorkloadFormState['processorArchitecture'],
): string {
  if (architecture === 'gpu') {
    return 'GPU/CUDA validation: compare accelerator type, quota, and data-staging cost.';
  }

  const armFactor = COMPUTE_ARM_COST_FACTORS[providerId];

  if (architecture === 'arm64') {
    const x86Equivalent = computeMonthly / armFactor;
    const avoidedMonthly = Math.max(0, x86Equivalent - computeMonthly);

    return `Selected ARM vs x86: ${formatCurrency(avoidedMonthly)}/mo modeled compute avoided.`;
  }

  const armTarget = computeMonthly * armFactor;
  const potentialSavings = Math.max(0, computeMonthly - armTarget);

  return `Modeled ARM target: ${formatCurrency(
    potentialSavings,
  )}/mo potential if the workload is portable.`;
}

export function providerDeltaRows(comparison: ComparisonResult | null): ProviderDeltaRow[] {
  if (!comparison) {
    return [];
  }

  return SERVICE_CATEGORIES.flatMap((category) => {
    const categoryCosts = comparison.providers
      .map((provider) => {
        const lineItems = provider.lineItems.filter((lineItem) => lineItem.category === category);
        const monthly = lineItems.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);

        return {
          providerId: provider.providerId,
          monthly: roundCurrency(monthly),
          lineItemCount: lineItems.length,
          approximate: lineItems.some((lineItem) => lineItem.isApproximate),
        };
      })
      .filter((provider) => provider.monthly > 0)
      .sort((left, right) => left.monthly - right.monthly);

    if (categoryCosts.length < 2) {
      return [];
    }

    const lowest = categoryCosts[0];
    const highest = categoryCosts.at(-1);

    if (!highest || highest.monthly <= lowest.monthly) {
      return [];
    }

    const monthlyDelta = roundCurrency(highest.monthly - lowest.monthly);
    const savingsPercent = ((highest.monthly - lowest.monthly) / highest.monthly) * 100;
    const approximateCount = categoryCosts.filter((provider) => provider.approximate).length;
    const lineItemCount = categoryCosts.reduce(
      (count, provider) => count + provider.lineItemCount,
      0,
    );

    return [
      {
        category,
        lowProviderId: lowest.providerId,
        highProviderId: highest.providerId,
        lowMonthly: lowest.monthly,
        highMonthly: highest.monthly,
        monthlyDelta,
        savingsPercent,
        coverage: `${categoryCosts.length}/3 providers · ${lineItemCount} line items`,
        insight: `${providerLabel(lowest.providerId)} is ${formatPercent(
          savingsPercent,
        )} lower than ${providerLabel(highest.providerId)} for ${category}.`,
        evidence:
          approximateCount > 0
            ? `${approximateCount} provider mapping(s) are approximate; validate architecture fit before procurement.`
            : `Derived from cached ${category} line items: ${formatCurrency(
                lowest.monthly,
              )}/mo vs ${formatCurrency(highest.monthly)}/mo.`,
      },
    ];
  }).sort((left, right) => right.monthlyDelta - left.monthlyDelta);
}

export function storageLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'storage' ||
      lineItemCostComponent(lineItem) === 'storage' ||
      storageDescriptionMatches(lineItem.description) ||
      storageDescriptionMatches(lineItem.skuId ?? ''),
  );
}

export function storageClassDisplayName(storageClass: WorkloadFormState['storageClass']): string {
  const option = STORAGE_CLASS_OPTIONS.find(([value]) => value === storageClass);

  return option?.[1] ?? storageClass.replace(/-/g, ' ');
}

export function databaseIntelligenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'database' ||
      lineItemCostComponent(lineItem) === 'database' ||
      databaseDescriptionMatches(lineItem.description) ||
      databaseDescriptionMatches(lineItem.skuId ?? ''),
  );
}

export function databaseCapacitySignal(input: {
  dimensions: ReturnType<typeof databaseDimensionTotals>;
  nosqlReadsMillion: number;
  nosqlWritesMillion: number;
  ruPerSecond: number;
}): string {
  const parts = [
    input.ruPerSecond > 0
      ? `${formatDecimal(input.ruPerSecond)} RU/s (${formatCurrency(input.dimensions.ru)}/mo)`
      : undefined,
    input.nosqlReadsMillion + input.nosqlWritesMillion > 0
      ? `${formatDecimal(input.nosqlReadsMillion)}M reads / ${formatDecimal(
          input.nosqlWritesMillion,
        )}M writes (${formatCurrency(input.dimensions.nosql)}/mo)`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'Provisioned instance/storage baseline';
}

export function databaseResilienceSignal(input: {
  backupDays: number;
  backupGb: number;
  dimensions: ReturnType<typeof databaseDimensionTotals>;
  provisionedIops: number;
  readReplicas: number;
  replicaTransferGb: number;
  storageGrowthGb: number;
}): string {
  const parts = [
    input.readReplicas > 0 || input.replicaTransferGb > 0
      ? `${formatDecimal(input.readReplicas)} replicas / ${formatDecimal(
          input.replicaTransferGb,
        )}GB transfer (${formatCurrency(input.dimensions.replica)}/mo)`
      : undefined,
    input.backupGb > 0 || input.storageGrowthGb > 0
      ? `${formatDecimal(input.backupGb)}GB backup / ${formatDecimal(
          input.storageGrowthGb,
        )}GB growth (${formatCurrency(input.dimensions.backup)}/mo)`
      : undefined,
    input.provisionedIops > 0
      ? `${formatDecimal(input.provisionedIops)} IOPS (${formatCurrency(
          input.dimensions.performance,
        )}/mo)`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'No backup/replica/IOPS surcharge surfaced';
}

export function databaseAnalyticsSignal(input: {
  cacheReplicas: number;
  dimensions: ReturnType<typeof databaseDimensionTotals>;
  queryDataTb: number;
  searchNodes: number;
  searchQueriesMillion: number;
  searchStorageGb: number;
  warehouseQueryTb: number;
  warehouseStorageGb: number;
}): string {
  const queryTb = input.queryDataTb + input.warehouseQueryTb;
  const parts = [
    queryTb > 0 || input.warehouseStorageGb > 0
      ? `${formatDecimal(queryTb)}TB query / ${formatDecimal(
          input.warehouseStorageGb,
        )}GB warehouse (${formatCurrency(input.dimensions.query + input.dimensions.warehouse)}/mo)`
      : undefined,
    input.cacheReplicas > 0
      ? `${formatDecimal(input.cacheReplicas)} cache replicas (${formatCurrency(
          input.dimensions.cache,
        )}/mo)`
      : undefined,
    input.searchNodes + input.searchStorageGb + input.searchQueriesMillion > 0
      ? `${formatDecimal(input.searchNodes)} search nodes / ${formatDecimal(
          input.searchStorageGb,
        )}GB index (${formatCurrency(input.dimensions.search)}/mo)`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'No warehouse/cache/search row surfaced';
}

export function databaseDimensionSummary(dimensions: ReturnType<typeof databaseDimensionTotals>): string {
  const active = Object.entries(dimensions)
    .filter(([, value]) => value > 0.005)
    .map(([key]) => key);

  return active.length > 0 ? active.join(', ') : 'no priced database dimensions above threshold';
}

export function databaseAnatomyRecommendation(
  dimensions: ReturnType<typeof databaseDimensionTotals>,
  signals: {
    cacheReplicas: number;
    provisionedIops: number;
    queryDataTb: number;
    readReplicas: number;
    ruPerSecond: number;
    searchNodes: number;
    storageGrowthGb: number;
  },
): string {
  const dominant = Object.entries(dimensions).sort((left, right) => right[1] - left[1])[0]?.[0];

  if (dominant === 'ru' || signals.ruPerSecond > 0) {
    return 'Validate RU/s utilization, autoscale bounds, and serverless break-even.';
  }

  if (dominant === 'nosql') {
    return 'Compare on-demand and provisioned NoSQL capacity before choosing mode.';
  }

  if (dominant === 'query' || dominant === 'warehouse' || signals.queryDataTb > 0) {
    return 'Separate warehouse storage from query compute and compare committed capacity.';
  }

  if (dominant === 'search' || signals.searchNodes > 0) {
    return 'Right-size search replicas, partitions, and index lifecycle before scaling.';
  }

  if (dominant === 'cache' || signals.cacheReplicas > 0) {
    return 'Validate cache replica count, TTL policy, and failover topology.';
  }

  if (dominant === 'replica' || signals.readReplicas > 0) {
    return 'Confirm read-replica count and standby topology against RPO/RTO.';
  }

  if (dominant === 'performance' || signals.provisionedIops > 0) {
    return 'Tune provisioned IOPS using observed latency and transaction peaks.';
  }

  if (dominant === 'backup' || signals.storageGrowthGb > 0) {
    return 'Model backup retention and database storage autoscaling before commitment.';
  }

  return 'Validate managed tier, engine limits, storage growth, and query profile.';
}

export function runtimeOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): RuntimeOptimizationRow[] {
  if (!comparison) {
    return [];
  }

  const functionInvocationsMillion = parseInputNumber(form.functionInvocationsMillion) ?? 0;
  const functionDurationMs = parseInputNumber(form.functionDurationMs) ?? 0;
  const functionMemoryMb = parseInputNumber(form.functionMemoryMb) ?? 0;
  const appPlatformRequestsMillion = parseInputNumber(form.appPlatformRequestsMillion) ?? 0;
  const appPlatformRequestDurationMs = parseInputNumber(form.appPlatformRequestDurationMs) ?? 0;
  const appPlatformVcpu = parseInputNumber(form.appPlatformVcpu) ?? 0;
  const appPlatformMemoryGb = parseInputNumber(form.appPlatformMemoryGb) ?? 0;
  const kubernetesClusterCount = parseInputNumber(form.kubernetesClusterCount) ?? 0;
  const kubernetesWorkerNodeCount = parseInputNumber(form.kubernetesWorkerNodeCount) ?? 0;
  const registryStorageGb = parseInputNumber(form.registryStorageGb) ?? 0;
  const registryEgressGb = parseInputNumber(form.registryEgressGb) ?? 0;
  const usageSignalParts = [
    functionInvocationsMillion > 0
      ? `${formatDecimal(functionInvocationsMillion)}M invocations`
      : undefined,
    functionInvocationsMillion > 0 && functionDurationMs > 0 && functionMemoryMb > 0
      ? `${formatDecimal(functionDurationMs)}ms @ ${formatDecimal(functionMemoryMb)}MB`
      : undefined,
    appPlatformRequestsMillion > 0
      ? `${formatDecimal(appPlatformRequestsMillion)}M app requests`
      : undefined,
    appPlatformRequestsMillion > 0 && appPlatformVcpu > 0 && appPlatformMemoryGb > 0
      ? `${formatDecimal(appPlatformRequestDurationMs)}ms @ ${formatDecimal(
          appPlatformVcpu,
        )} vCPU / ${formatDecimal(appPlatformMemoryGb)}GB`
      : undefined,
    kubernetesClusterCount + kubernetesWorkerNodeCount > 0
      ? `${formatDecimal(kubernetesClusterCount)} clusters / ${formatDecimal(
          kubernetesWorkerNodeCount,
        )} nodes`
      : undefined,
    registryStorageGb > 0 ? `${formatDecimal(registryStorageGb)}GB registry` : undefined,
    registryEgressGb > 0 ? `${formatDecimal(registryEgressGb)}GB image egress` : undefined,
  ].filter(Boolean);
  const usageSignal = usageSignalParts.join(' · ') || 'Runtime rows only';
  const hasAdvancedFormSignal =
    functionInvocationsMillion > 0 ||
    appPlatformRequestsMillion > 0 ||
    kubernetesClusterCount > 0 ||
    kubernetesWorkerNodeCount > 0 ||
    registryStorageGb > 0 ||
    registryEgressGb > 0;

  return comparison.providers
    .flatMap((provider) => {
      const runtimeRows = runtimeIntelligenceLineItems(provider).sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      );
      const advancedRows = runtimeRows.filter((lineItem) =>
        runtimeAdvancedDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
      );
      const primary = advancedRows[0] ?? runtimeRows[0];
      const runtimeMonthly = roundCurrency(
        runtimeRows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );
      const runtimeSharePercent =
        provider.totals.monthly > 0 ? (runtimeMonthly / provider.totals.monthly) * 100 : 0;
      const material =
        runtimeMonthly >= 10 ||
        runtimeSharePercent >= 10 ||
        hasAdvancedFormSignal ||
        advancedRows.length > 0;

      if (!primary || runtimeMonthly <= 0 || !material) {
        return [];
      }

      const signal = runtimeOptimizationSignal(primary, runtimeMonthly, {
        functionDurationMs,
        functionInvocationsMillion,
        functionMemoryMb,
        appPlatformMemoryGb,
        appPlatformRequestDurationMs,
        appPlatformRequestsMillion,
        appPlatformVcpu,
        kubernetesClusterCount,
        kubernetesWorkerNodeCount,
        registryEgressGb,
        registryStorageGb,
      });

      return [
        {
          providerId: provider.providerId,
          runtimeMonthly,
          runtimeSharePercent,
          usageSignal,
          annualSavings: roundCurrency(signal.monthlySavings * 12),
          ...signal,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

export function serverlessFunctionMonthly(
  providerId: ProviderId,
  input: {
    requestsMillion: number;
    durationMs: number;
    memoryMb: number;
  },
): number {
  const rates = SERVERLESS_FUNCTION_RATES[providerId];
  const invocations = input.requestsMillion * 1_000_000;
  const durationSeconds = input.durationMs / 1000;
  const memoryGb = input.memoryMb / 1024;
  const requestCost = input.requestsMillion * rates.requestPerMillion;
  const durationCost = invocations * durationSeconds * memoryGb * rates.gbSecond;

  return roundCurrency(requestCost + durationCost);
}

export function appPlatformRequestMonthly(
  providerId: ProviderId,
  input: {
    durationMs: number;
    memoryGb: number;
    requestsMillion: number;
    vcpu: number;
  },
): number {
  const rates = APP_PLATFORM_MODEL_RATES[providerId];
  const activeHours = (input.requestsMillion * 1_000_000 * (input.durationMs / 1000)) / 3600;
  const requestCost = input.requestsMillion * rates.requestPerMillion;
  const computeCost = activeHours * input.vcpu * rates.vcpuHour;
  const memoryCost = activeHours * input.memoryGb * rates.memoryGbHour;

  return roundCurrency(requestCost + computeCost + memoryCost);
}

export function appPlatformAlwaysOnMonthly(
  providerId: ProviderId,
  input: {
    alwaysOnHours: number;
    memoryGb: number;
    minInstances: number;
    vcpu: number;
  },
): number {
  const rates = APP_PLATFORM_MODEL_RATES[providerId];
  const instanceHours = Math.max(0, input.alwaysOnHours) * Math.max(0, input.minInstances);

  return roundCurrency(
    instanceHours *
      (input.vcpu * rates.alwaysOnVcpuHour + input.memoryGb * rates.alwaysOnMemoryGbHour),
  );
}

export function operationsOptimizationRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): OperationsOptimizationRow[] {
  if (!comparison) {
    return [];
  }

  const observabilityMetricsMillion = parseInputNumber(form.observabilityMetricsMillion) ?? 0;
  const observabilityLogsIngestGb = parseInputNumber(form.observabilityLogsIngestGb) ?? 0;
  const observabilityLogRetentionGb = parseInputNumber(form.observabilityLogRetentionGb) ?? 0;
  const observabilityAlarms = parseInputNumber(form.observabilityAlarms) ?? 0;
  const observabilityDashboards = parseInputNumber(form.observabilityDashboards) ?? 0;
  const observabilityTracesMillion = parseInputNumber(form.observabilityTracesMillion) ?? 0;
  const secretsCount = parseInputNumber(form.secretsCount) ?? 0;
  const secretApiCallsTenThousand = parseInputNumber(form.secretApiCallsTenThousand) ?? 0;
  const securityProtectedResources = parseInputNumber(form.securityProtectedResources) ?? 0;
  const securityFindingsThousand = parseInputNumber(form.securityFindingsThousand) ?? 0;
  const wafWebAclCount = parseInputNumber(form.wafWebAclCount) ?? 0;
  const wafRuleCount = parseInputNumber(form.wafRuleCount) ?? 0;
  const wafRequestsMillion = parseInputNumber(form.wafRequestsMillion) ?? 0;
  const ddosProtectedResources = parseInputNumber(form.ddosProtectedResources) ?? 0;
  const usageSignalParts = [
    observabilityMetricsMillion > 0
      ? `${formatDecimal(observabilityMetricsMillion)}M metrics`
      : undefined,
    observabilityLogsIngestGb > 0
      ? `${formatDecimal(observabilityLogsIngestGb)}GB logs`
      : undefined,
    observabilityLogRetentionGb > 0
      ? `${formatDecimal(observabilityLogRetentionGb)}GB-mo retention`
      : undefined,
    observabilityTracesMillion > 0
      ? `${formatDecimal(observabilityTracesMillion)}M traces`
      : undefined,
    secretsCount > 0 ? `${formatDecimal(secretsCount)} secrets` : undefined,
    wafRequestsMillion > 0 ? `${formatDecimal(wafRequestsMillion)}M WAF requests` : undefined,
    ddosProtectedResources > 0
      ? `${formatDecimal(ddosProtectedResources)} DDoS resources`
      : undefined,
  ].filter(Boolean);
  const usageSignal = usageSignalParts.join(' · ') || 'Operations rows only';
  const hasAdvancedFormSignal =
    observabilityMetricsMillion > 0 ||
    observabilityLogsIngestGb > 0 ||
    observabilityLogRetentionGb > 0 ||
    observabilityAlarms > 0 ||
    observabilityDashboards > 0 ||
    observabilityTracesMillion > 0 ||
    secretsCount > 0 ||
    secretApiCallsTenThousand > 0 ||
    securityProtectedResources > 0 ||
    securityFindingsThousand > 0 ||
    wafWebAclCount > 0 ||
    wafRuleCount > 0 ||
    wafRequestsMillion > 0 ||
    ddosProtectedResources > 0;

  return comparison.providers
    .flatMap((provider) => {
      const operationsRows = operationsIntelligenceLineItems(provider).sort(
        (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
      );
      const advancedRows = operationsRows.filter((lineItem) =>
        operationsAdvancedDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
      );
      const primary = advancedRows[0] ?? operationsRows[0];
      const operationsMonthly = roundCurrency(
        operationsRows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
      );
      const operationsSharePercent =
        provider.totals.monthly > 0 ? (operationsMonthly / provider.totals.monthly) * 100 : 0;
      const material =
        operationsMonthly >= 10 ||
        operationsSharePercent >= 10 ||
        hasAdvancedFormSignal ||
        advancedRows.length > 0;

      if (!primary || operationsMonthly <= 0 || !material) {
        return [];
      }

      const signal = operationsOptimizationSignal(primary, operationsMonthly, {
        ddosProtectedResources,
        observabilityAlarms,
        observabilityDashboards,
        observabilityLogRetentionGb,
        observabilityLogsIngestGb,
        observabilityMetricsMillion,
        observabilityTracesMillion,
        secretApiCallsTenThousand,
        secretsCount,
        securityFindingsThousand,
        securityProtectedResources,
        wafRequestsMillion,
        wafRuleCount,
        wafWebAclCount,
      });

      return [
        {
          providerId: provider.providerId,
          operationsMonthly,
          operationsSharePercent,
          usageSignal,
          annualSavings: roundCurrency(signal.monthlySavings * 12),
          ...signal,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

export function regionVarianceRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
  serverRows?: ComparisonAnalyticsResponse['regionVarianceHeatMap'],
): RegionVarianceRow[] {
  if (serverRows && serverRows.length > 0) {
    return serverRows.map((row) => ({
      regionId: row.comparisonRegion,
      label: row.label,
      regionSummary: row.regionSummary,
      multiplier: row.multiplier,
      evidence: row.evidence,
      isSelected: row.isSelected,
      providers: row.providers.map((provider) => ({
        providerId: provider.providerId,
        providerRegion: provider.providerRegion,
        modeledMonthly: provider.modeledMonthlyUsd,
        deltaVsSelected: provider.deltaVsSelectedMonthlyUsd,
        isLowest: provider.isLowest,
      })),
      lowestProviderId: row.lowestProviderId,
    }));
  }

  if (!comparison || comparison.providers.length === 0) {
    return [];
  }

  const selectedRegion = canonicalRegionForRegionPreference(form.regionPreference);
  const allowedRegions =
    form.complianceLocked && form.dataResidency
      ? canonicalRegionsForResidencyScope(form.dataResidency)
      : undefined;
  const visibleProfiles = REGION_VARIANCE_PROFILES.filter(
    (profile) => !allowedRegions || allowedRegions.includes(profile.regionId),
  );

  return visibleProfiles.map((profile) => {
    const group = COMPARISON_REGION_GROUPS.find((candidate) => candidate.id === profile.regionId);
    const providerCosts = comparison.providers
      .map((provider) => ({
        providerId: provider.providerId,
        providerRegion: group?.providerRegions[provider.providerId] ?? profile.regionId,
        modeledMonthly: roundCurrency(provider.totals.monthly * profile.multiplier),
        deltaVsSelected: roundCurrency(
          provider.totals.monthly * profile.multiplier - provider.totals.monthly,
        ),
        isLowest: false,
      }))
      .sort((left, right) => left.modeledMonthly - right.modeledMonthly);
    const lowest = providerCosts[0];

    return {
      regionId: profile.regionId,
      label: group?.label ?? profile.regionId,
      regionSummary: group ? providerRegionSummary(group) : profile.regionId,
      multiplier: profile.multiplier,
      evidence: profile.evidence,
      isSelected: selectedRegion === profile.regionId,
      providers: providerCosts
        .map((provider) => ({
          ...provider,
          isLowest: provider.providerId === lowest?.providerId,
        }))
        .sort(
          (left, right) =>
            PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId),
        ),
      lowestProviderId: lowest?.providerId,
    };
  });
}

export function networkLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'network' ||
      lineItemCostComponent(lineItem) === 'egress' ||
      networkDescriptionMatches(lineItem.description),
  );
}

export function networkingRateEvidence(lineItem: ComparisonLineItem): string {
  const tieredGb = lineItemTierBillableGb(lineItem);

  if (lineItem.egressTiers?.length && tieredGb > 0) {
    const blendedRate = lineItem.baseMonthlyCostUsd / tieredGb;

    return `${lineItem.egressTiers.length} tier(s) · ${formatCurrency(blendedRate)}/GB blended`;
  }

  if (lineItem.unitPriceUsd !== undefined) {
    return `${formatCurrency(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'}`;
  }

  if (lineItem.baseHourlyCostUsd !== undefined) {
    return `${formatCurrency(lineItem.baseHourlyCostUsd)}/hr x ${HOURS_PER_MONTH} hrs`;
  }

  return 'Monthly modeled subtotal';
}

export function networkingVolumeEvidence(lineItem: ComparisonLineItem): string {
  const tieredGb = lineItemTierBillableGb(lineItem);

  if (tieredGb > 0) {
    return `${formatDecimal(tieredGb)}GB tier-traced`;
  }

  const match = lineItem.description.match(/\(([^)]+)\)/);

  return match?.[1] ?? lineItem.region ?? 'Volume/rate captured in line item';
}

export function spotBlendOptimizerRows(
  comparison: ComparisonResult | null,
  form: WorkloadFormState,
): SpotBlendOptimizerRow[] {
  if (!comparison) {
    return [];
  }

  const spotPercent = spotBlendPercent(form);
  const spotRate = spotPercent / 100;
  const onDemandPercent = 100 - spotPercent;

  return comparison.providers
    .flatMap((provider) => {
      const onDemandMonthly =
        provider.pricingModels?.find((model) => model.model === 'on-demand')?.monthlyCostUsd ??
        provider.totals.monthly;
      const spotModel = provider.pricingModels?.find(
        (model) => model.model === 'spot' && model.available && model.monthlyCostUsd !== undefined,
      );

      if (!spotModel?.monthlyCostUsd || spotModel.monthlyCostUsd >= onDemandMonthly) {
        return [];
      }

      const blendedMonthly = roundCurrency(
        onDemandMonthly * (1 - spotRate) + spotModel.monthlyCostUsd * spotRate,
      );
      const monthlySavings = roundCurrency(onDemandMonthly - blendedMonthly);

      if (monthlySavings <= 0) {
        return [];
      }

      const risk = spotBlendRisk(form, spotPercent, spotModel.volatility);
      const interruptionFrequency = spotInterruptionFrequency(
        provider.providerId,
        risk,
        spotPercent,
        spotModel.volatility,
      );
      const estimatedLowMonthly = roundCurrency(blendedMonthly * 0.94);
      const estimatedHighMonthly = roundCurrency(blendedMonthly * 1.06);

      return [
        {
          providerId: provider.providerId,
          onDemandMonthly: roundCurrency(onDemandMonthly),
          spotMonthly: roundCurrency(spotModel.monthlyCostUsd),
          blendedMonthly,
          estimatedLowMonthly,
          estimatedHighMonthly,
          monthlySavings,
          annualSavings: roundCurrency(monthlySavings * 12),
          spotPercent,
          onDemandPercent,
          risk,
          interruptionFrequency,
          providerTerm: spotModel.providerTerm ?? spotModel.displayName ?? 'Spot estimate',
          workloadFit: spotBlendWorkloadFit(form, spotPercent),
          evidence: `${providerLabel(provider.providerId)} spot estimate is ${formatCurrency(
            spotModel.monthlyCostUsd,
          )}/mo versus ${formatCurrency(onDemandMonthly)}/mo on-demand. ${
            spotModel.caveat ??
            'Validate interruption tolerance and current spot market behavior before committing.'
          }`,
        },
      ];
    })
    .sort((left, right) => right.monthlySavings - left.monthlySavings);
}

export function finOpsFindingRiskFlag(
  finding: ComparisonAnalyticsResponse['finOpsFindings'][number],
): ArchitectureRiskFlag {
  const impact =
    finding.estimatedMonthlyImpactUsd !== undefined
      ? `${formatCurrency(finding.estimatedMonthlyImpactUsd)}/mo`
      : finding.category;
  const providerSignal = finding.providerId ? providerLabel(finding.providerId) : 'All providers';

  return {
    id: `backend-${finding.id}`,
    title: finding.title,
    severity: finOpsRiskSeverity(finding.severity),
    signal: `${providerSignal} · ${impact}`,
    evidence: `Backend FinOps finding: ${finding.recommendation}`,
  };
}

export function componentMonthly(provider: ComparisonProviderResult, component: CostComponent): number {
  return provider.lineItems
    .filter((lineItem) => lineItemCostComponent(lineItem) === component)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

export function buildExecutiveDecision({
  approximateCount,
  dominantCategory,
  lineItemCount,
  monthlyLowest,
  monthlySpread,
  monthlySpreadPercent,
  pricedProviderCount,
  yearlyLowest,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
  pricedProviderCount: number;
  yearlyLowest?: ProviderCostSummary;
}): ExecutiveDecision {
  if (lineItemCount === 0 || !monthlyLowest) {
    return {
      headline: 'Run a comparison to create a decision memo',
      subhead:
        'PolyCost will translate requirements into a cloud-neutral cost baseline, provider fit, and stakeholder actions.',
      confidence: 'Pending',
      confidenceDetail: 'No provider estimates yet',
      lenses: [
        {
          role: 'Budget',
          label: 'Budget decision',
          value: 'Pending',
          detail: 'A comparison is required before the estimate can support budget approval.',
        },
        {
          role: 'Delivery',
          label: 'Delivery decision',
          value: 'Pending',
          detail:
            'Capture availability, data, and scaling assumptions before shortlisting a cloud.',
        },
        {
          role: 'Risk',
          label: 'Fit decision',
          value: 'Pending',
          detail: 'Validate workload assumptions before mapping services to provider designs.',
        },
        {
          role: 'Governance',
          label: 'Governance decision',
          value: 'Pending',
          detail: 'Use the first estimate to seed budgets, tags, and scenario tracking.',
        },
        {
          role: 'Provider',
          label: 'Provider decision',
          value: 'Pending',
          detail: 'Validate service equivalence after the workload is normalized.',
        },
      ],
    };
  }

  const confidence = decisionConfidence(pricedProviderCount, approximateCount);
  const annualExposure = yearlyLowest?.total;
  const avoidableAnnualSpend =
    monthlySpread !== undefined ? roundCurrency(monthlySpread * 12) : undefined;
  const provider = providerLabel(monthlyLowest.providerId);
  const driver = dominantCategory ? capitalize(dominantCategory.category) : 'the top category';

  return {
    headline: `${provider} is the current executive cost baseline`,
    subhead: [
      `${provider} leads the on-demand monthly view at ${formatCurrency(monthlyLowest.total ?? 0)}.`,
      avoidableAnnualSpend !== undefined && avoidableAnnualSpend > 0
        ? `The annualized spread to the highest estimate is ${formatCurrency(avoidableAnnualSpend)} before commitments or private pricing.`
        : 'All priced providers are tightly clustered before commitments or private pricing.',
    ].join(' '),
    confidence,
    confidenceDetail: confidenceDetail(confidence, pricedProviderCount, approximateCount),
    annualExposure,
    avoidableAnnualSpend,
    lenses: [
      {
        role: 'Budget',
        label: 'Budget decision',
        value: annualExposure !== undefined ? formatCurrency(annualExposure) : 'Pending',
        detail: 'Use as the directional annual budget baseline before vendor negotiation.',
      },
      {
        role: 'Delivery',
        label: 'Delivery decision',
        value: driver,
        detail: `Prioritize ${driver.toLowerCase()} sizing, resilience, and managed-service tier review.`,
      },
      {
        role: 'Risk',
        label: 'Fit decision',
        value: approximateCount > 0 ? 'Mapping review' : 'Pattern review',
        detail: `Validate ${provider} regional services, HA pattern, quotas, and data/network assumptions before target-cloud selection.`,
      },
      {
        role: 'Governance',
        label: 'Governance decision',
        value:
          monthlySpreadPercent !== undefined
            ? `${formatPercent(monthlySpreadPercent)} spread`
            : 'Spread pending',
        detail: 'Create guardrails for tags, budgets, alerts, and commitment-model scenarios.',
      },
      {
        role: 'Provider',
        label: 'Provider decision',
        value: approximateCount > 0 ? 'Equivalence review' : 'Service fit ready',
        detail:
          approximateCount > 0
            ? 'Validate approximate mappings against AWS, Azure, and GCP managed-service behavior.'
            : 'Validate regional SKU availability, quotas, and network/data-transfer assumptions.',
      },
    ],
  };
}

export function buildSolutionArchitectureReview({
  approximateCount,
  dominantCategory,
  form,
  lineItemCount,
  monthlyLowest,
  monthlySpreadPercent,
  pricedProviderCount,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  form: WorkloadFormState;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpreadPercent?: number;
  pricedProviderCount: number;
}): SolutionArchitectureReview {
  if (lineItemCount === 0 || !monthlyLowest) {
    return {
      posture: 'Pending',
      riskLevel: 'Pending',
      baselineLabel: 'Provider baseline pending',
      baselineValue: 'Run comparison',
      summary:
        'An engineering review will appear after PolyCost has provider totals and workload assumptions to inspect.',
      checkpoints: [
        {
          label: 'Service mapping',
          value: 'Pending',
          detail: 'Normalize requirements before validating AWS, Azure, and GCP equivalents.',
          tone: 'pending',
        },
        {
          label: 'Resilience',
          value: 'Pending',
          detail: 'Confirm multi-AZ, database HA, recovery objectives, and SLA target.',
          tone: 'pending',
        },
        {
          label: 'Scaling',
          value: 'Pending',
          detail: 'Capture fixed or autoscaling bounds before provider selection.',
          tone: 'pending',
        },
        {
          label: 'Data and network',
          value: 'Pending',
          detail: 'Estimate egress, CDN, load-balancing, and stateful service needs.',
          tone: 'pending',
        },
      ],
    };
  }

  const riskLevel = solutionArchitectureRisk({
    approximateCount,
    form,
    pricedProviderCount,
  });
  const posture = solutionArchitecturePosture(riskLevel);
  const provider = providerLabel(monthlyLowest.providerId);
  const driver = dominantCategory ? capitalize(dominantCategory.category) : 'Core workload';
  const egressGb = parseInputNumber(form.monthlyEgressGb);
  const egressLabel =
    egressGb !== undefined ? `${egressGb}GB monthly egress modeled` : 'Egress not specified';
  const peakUsers = parseInputNumber(form.peakConcurrentUsers);
  const hasResilience = form.multiRegion || form.multiAz;
  const databaseHaReady = !form.databaseEnabled || form.databaseHighAvailability;
  const loadPathReady = form.loadBalancer || (peakUsers !== undefined && peakUsers < 250);
  const edgeReady = form.cdn || egressGb === undefined || egressGb < 500;

  return {
    posture,
    riskLevel,
    baselineLabel: `${provider} cost baseline`,
    baselineValue: driver,
    summary: [
      `${provider} is the current cost baseline, but the engineering gate should validate service equivalence, resilience, scaling, and data movement before cloud commitment.`,
      monthlySpreadPercent !== undefined && monthlySpreadPercent >= 20
        ? `The ${formatPercent(monthlySpreadPercent)} provider spread is material enough to review architecture patterns before procurement.`
        : 'The cost spread is not enough by itself to skip architecture-fit validation.',
    ].join(' '),
    checkpoints: [
      {
        label: 'Service mapping',
        value: approximateCount > 0 ? `${approximateCount} approximate` : 'Exact mappings',
        detail:
          approximateCount > 0
            ? 'Validate managed-service behavior, limits, and operational differences before shortlisting.'
            : 'Exact catalog mappings are present; still confirm regional SKU availability and quotas.',
        tone: approximateCount > 0 ? 'review' : 'good',
      },
      {
        label: 'Resilience',
        value: form.multiRegion ? 'Multi-region' : form.multiAz ? 'Multi-AZ' : 'Single-zone risk',
        detail: databaseHaReady
          ? `SLA target ${form.slaTarget || 'not stated'}; confirm RTO/RPO and failover design.`
          : 'Database HA is disabled; validate recovery objectives before production approval.',
        tone: hasResilience && databaseHaReady ? 'good' : 'risk',
      },
      {
        label: 'Scaling',
        value:
          form.scalingType === 'autoscaling'
            ? `${form.autoscaleMin || 'min'}-${form.autoscaleMax || 'max'} autoscale`
            : `${form.instanceCount || 'Fixed'} fixed nodes`,
        detail:
          form.scalingType === 'autoscaling'
            ? 'Review warm-up time, scaling policy, and provider-specific quota ceilings.'
            : 'Fixed capacity needs load testing against peak concurrency before target-cloud selection.',
        tone: form.scalingType === 'autoscaling' ? 'good' : 'review',
      },
      {
        label: 'Data and network',
        value: form.cdn && form.loadBalancer ? 'Edge ready' : 'Review path',
        detail:
          loadPathReady && edgeReady
            ? `${egressLabel}; confirm CDN cache ratio and transfer paths.`
            : 'Validate load balancing, CDN, private connectivity, and egress assumptions for production traffic.',
        tone: loadPathReady && edgeReady ? 'good' : 'review',
      },
    ],
  };
}

export function categoryTotalsForLineItems(
  lineItems: ComparisonProviderResult['lineItems'],
  interval: IntervalKey,
): CategoryCostSummary[] {
  const intervalMultiplier = intervalCostMultiplier(interval);
  const categoryTotals = new Map<ServiceCategory, number>(
    SERVICE_CATEGORIES.map((category) => [category, 0]),
  );

  for (const lineItem of lineItems) {
    categoryTotals.set(
      lineItem.category,
      (categoryTotals.get(lineItem.category) ?? 0) +
        lineItem.baseMonthlyCostUsd * intervalMultiplier,
    );
  }

  const total = Array.from(categoryTotals.values()).reduce((sum, value) => sum + value, 0);

  return SERVICE_CATEGORIES.map((category) => {
    const categoryTotal = categoryTotals.get(category) ?? 0;

    return {
      category,
      total: roundCurrency(categoryTotal),
      percentOfTotal: total > 0 ? Math.max(4, (categoryTotal / total) * 100) : 0,
    };
  });
}

export function emptyCategoryTotals(): CategoryCostSummary[] {
  return SERVICE_CATEGORIES.map((category) => ({
    category,
    total: 0,
    percentOfTotal: 0,
  }));
}

export function categoryHeatmapRows(summaries: ProviderCostSummary[]): Array<{
  category: ServiceCategory;
  providers: Array<{ providerId: ProviderId; total?: number; percentOfMax: number }>;
}> {
  const summaryMap = new Map<ProviderId, ProviderCostSummary>(
    summaries.map((summary) => [summary.providerId, summary]),
  );

  return SERVICE_CATEGORIES.map((category) => {
    const providers = PROVIDER_ORDER.map((providerId) => {
      const summary = summaryMap.get(providerId);
      const categoryTotal = summary?.categoryTotals.find((item) => item.category === category);

      return {
        providerId,
        total: summary?.total !== undefined ? (categoryTotal?.total ?? 0) : undefined,
      };
    });
    const maxTotal = Math.max(...providers.map((provider) => provider.total ?? 0), 0);

    return {
      category,
      providers: providers.map((provider) => ({
        ...provider,
        percentOfMax:
          provider.total !== undefined && maxTotal > 0
            ? Math.max(4, (provider.total / maxTotal) * 100)
            : 0,
      })),
    };
  });
}

export function inputModeSummaryLabel(inputMode: InputMode): string {
  return (
    INPUT_MODE_OPTIONS.find((option) => option.key === inputMode)?.summaryLabel ?? 'Manual entry'
  );
}

export function pricingModelSummaryLabel(pricingModel: PricingModelKey): string {
  return (
    PRICING_MODEL_OPTIONS.find((option) => option.key === pricingModel)?.shortLabel ?? 'On-demand'
  );
}

export function readStoredPricingModel(): PricingModelKey {
  const stored = window.localStorage.getItem(PRICING_MODEL_STORAGE_KEY);

  return PRICING_MODEL_OPTIONS.some((option) => option.key === stored)
    ? (stored as PricingModelKey)
    : 'on-demand';
}

export function storePricingModel(pricingModel: PricingModelKey): void {
  window.localStorage.setItem(PRICING_MODEL_STORAGE_KEY, pricingModel);
}

export function storeAuthSession(token: string, expiresAt: string | undefined): void {
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, token);

  if (expiresAt) {
    window.localStorage.setItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY, expiresAt);
  } else {
    window.localStorage.removeItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY);
  }
}

export function clearStoredAuthToken(): void {
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_SESSION_EXPIRES_AT_STORAGE_KEY);
}

export function createComparisonHistoryEntry({
  comparison,
  form,
  inputMode,
  pricingModel,
}: {
  comparison: ComparisonResult;
  form: WorkloadFormState;
  inputMode: InputMode;
  pricingModel: PricingModelKey;
}): ComparisonHistoryEntry {
  const cheapestProvider =
    comparison.providers.find(
      (provider) => provider.providerId === comparison.cheapestProviderId,
    ) ??
    comparison.providers.reduce<ComparisonProviderResult | undefined>((lowest, provider) => {
      if (!lowest || provider.totals.monthly < lowest.totals.monthly) {
        return provider;
      }

      return lowest;
    }, undefined);
  const cheapestProviderId = cheapestProvider?.providerId ?? comparison.cheapestProviderId;

  return {
    id: comparison.comparisonId,
    comparisonId: comparison.comparisonId,
    createdAt: new Date().toISOString(),
    form,
    inputMode,
    pricingModel,
    cheapestProviderId,
    serviceCount: serviceRequirementsFromForm(form).length,
    providerCount: comparison.providers.length,
    monthlyLowestUsd: cheapestProvider?.totals.monthly ?? 0,
    summary: comparisonHistorySummary(form),
  };
}

export function storeComparisonHistory(history: ComparisonHistoryEntry[]): void {
  window.localStorage.setItem(COMPARISON_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function clearComparisonHistory(): void {
  window.localStorage.removeItem(COMPARISON_HISTORY_STORAGE_KEY);
}

export function sanitizeInputMode(value: unknown): InputMode {
  return INPUT_MODE_OPTIONS.some((option) => option.key === value) ? (value as InputMode) : 'form';
}

export function storeRequirementSession(session: StoredRequirementSession): void {
  window.sessionStorage.setItem(REQUIREMENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearRequirementSession(): void {
  window.sessionStorage.removeItem(REQUIREMENT_SESSION_STORAGE_KEY);
}

export function isSupportedRequirementsFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = REQUIREMENTS_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );

  return hasSupportedExtension || REQUIREMENTS_FILE_MIME_TYPES.has(file.type);
}

export function diagramReviewComponentFromRequirement(
  node: {
    id: string;
    displayLabel: string;
    sourceRef: string;
  },
  requirement: ServiceRequirement,
): DiagramParseResult['review']['components'][number] {
  return {
    nodeId: node.id,
    displayLabel: node.displayLabel,
    serviceCategory: requirement.serviceCategory,
    serviceType: requirement.serviceType,
    confidence: 'low',
    sourceRef: node.sourceRef,
    assumedDefaults: manualAssumptionsForService(
      requirement.serviceCategory,
      requirement.serviceType,
    ),
    evidence: `Manual review classification -> ${requirement.serviceType}`,
    editable: true,
  };
}

export function diagramServiceOptionForType(serviceType: string) {
  return (
    DIAGRAM_REVIEW_SERVICE_OPTIONS.find((option) => option.serviceType === serviceType) ??
    DIAGRAM_REVIEW_SERVICE_OPTIONS[0]
  );
}
