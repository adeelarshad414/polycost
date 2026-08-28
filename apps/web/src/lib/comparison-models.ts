// Comparison / advisory model builders extracted from App.tsx (H-F1, slice 2).
//
// Unblocked by moving the shared view-model types into lib/app-view-types:
// these helpers were previously pinned inside App.tsx only because they
// referenced types declared there. They remain pure - no JSX, no hooks, no
// App state.

/* eslint-disable security/detect-object-injection -- Reviewed: typed
   provider/category lookup maps carried over verbatim from App.tsx. */

import { TaskQueueItem } from '../components/LoadingExperience';
import { HOURS_PER_MONTH } from '../cost-time';
import {
  ArchitectureRiskFlag,
  BusyAction,
  CategoryCostSummary,
  ComparisonLineItem,
  ComputeSizePreset,
  ComputeSizingIntent,
  ComputeSpecificationProfile,
  CostComponent,
  CostMatrixCell,
  CostMatrixSortKey,
  DatabaseOptimizationRow,
  EgressOptimizationRow,
  ExecutiveAnalyticsModel,
  ExecutiveDecision,
  ExecutiveLens,
  InputMode,
  OperationsOptimizationRow,
  ProviderCostSummary,
  ProviderFitSummary,
  RuntimeOptimizationRow,
  SensitivityScenarioProviderCost,
  SensitivityScenarioRow,
  ServiceCategory,
  ServiceRequirementCategory,
  SolutionArchitectureReview,
  SpotBlendOptimizerRow,
  StorageOptimizationRow,
} from './app-view-types';
import { formatCurrency, formatPercent, formatSignedCurrency } from './format';
import {
  arrayValue,
  booleanValue,
  capitalize,
  clampNumber,
  costForInterval,
  editStatusNotice,
  formatDateTime,
  formatDecimal,
  invoiceArtifactPolicyExceptionStatus,
  invoiceArtifactReviewStatus,
  invoiceControlValidationStatus,
  numberValue,
  objectValue,
  operationsDescriptionMatches,
  parseFormNumber,
  parseInputNumber,
  positiveFormNumber,
  providerLabel,
  providerServicesForFamily,
  regionLabelForSummary,
  roundChartCoordinate,
  roundCurrency,
  runtimeDescriptionMatches,
  safePreviewColor,
  serviceFamilyShortLabel,
  sizingTokenAt,
  sizingTokenKind,
  stringArrayValue,
  stringValue,
  workloadTypeLabel,
} from './workload-analysis';
import { CloudServiceFamily } from '../service-catalog';
import {
  ComparisonAnalyticsResponse,
  ComparisonProviderResult,
  ComparisonResult,
  DataHealthResponse,
  DiagramParseResult,
  INTERVALS,
  IntervalKey,
  InvoiceArtifactPolicyExceptionStatus,
  InvoiceArtifactReviewStatus,
  InvoiceControlValidationStatus,
  InvoiceReconciliationRecord,
  PROVIDER_ORDER,
  PricingModelKey,
  ProviderId,
  RegionCatalogResponse,
  ReportFormat,
} from '../types';
import { WorkloadFormState } from '../workload';

export function quickActionTaskItems(
  busyAction: BusyAction,
  exportingFormat: ReportFormat | null,
  completedExportFormat: ReportFormat | null,
): TaskQueueItem[] {
  if (busyAction === 'refresh') {
    return [
      {
        id: 'refresh-live-catalog',
        label: 'Refresh live catalog',
        status: 'running',
        phase: 'Refreshing traceable catalog rows and recomputing the saved workload',
      },
    ];
  }

  if (busyAction === 'export' && exportingFormat) {
    return [
      {
        id: `export-${exportingFormat}`,
        label: `Generate ${exportingFormat.toUpperCase()} report`,
        status: 'running',
        phase: 'Waiting for the report export job to complete',
      },
    ];
  }

  if (completedExportFormat) {
    return [
      {
        id: `export-${completedExportFormat}-completed`,
        label: `${completedExportFormat.toUpperCase()} report`,
        status: 'completed',
        phase: 'Downloaded to this browser session',
      },
    ];
  }

  return [];
}

export function resultStatusNotice(notice: string | null): string | null {
  return editStatusNotice(notice);
}

export function dataHealthBannerDetail(
  health: DataHealthResponse | null,
  error: string | null,
): string {
  if (error) {
    return error;
  }

  if (!health) {
    return 'Waiting for pricing cache health.';
  }

  const firstAlert = health.alerts[0]?.message;

  if (health.overallStatus !== 'fresh' && firstAlert) {
    return firstAlert;
  }

  return `Freshness policy ${health.freshnessPolicyHours}h · generated ${formatDateTime(
    health.generatedAt,
  )}`;
}

export function dataHealthProviderIssueLabel(
  provider: DataHealthResponse['providers'][number],
): string {
  const ageLabel =
    provider.ageHours !== undefined ? `${provider.ageHours}h old` : provider.freshness;

  return `${providerLabel(provider.providerId)} ${provider.freshness} (${ageLabel})`;
}

export function diagramLayoutPreview(
  nodes: DiagramParseResult['graph']['nodes'],
  edges: DiagramParseResult['graph']['edges'],
):
  | {
      nodes: Array<
        DiagramParseResult['graph']['nodes'][number] & {
          style: {
            left: string;
            top: string;
            width: string;
            minHeight: string;
            borderColor?: string;
            backgroundColor?: string;
            zIndex: number;
          };
          center: {
            x: number;
            y: number;
          };
        }
      >;
      edges: Array<{
        id: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }>;
    }
  | undefined {
  const layoutNodes = nodes.filter((node) => node.bounds).slice(0, 18);

  if (layoutNodes.length < 2) {
    return undefined;
  }

  const minX = Math.min(...layoutNodes.map((node) => node.bounds!.x));
  const minY = Math.min(...layoutNodes.map((node) => node.bounds!.y));
  const maxX = Math.max(...layoutNodes.map((node) => node.bounds!.x + node.bounds!.width));
  const maxY = Math.max(...layoutNodes.map((node) => node.bounds!.y + node.bounds!.height));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const positionedNodes = layoutNodes.map((node) => {
    const left = ((node.bounds!.x - minX) / spanX) * 82 + 4;
    const top = ((maxY - node.bounds!.y - node.bounds!.height) / spanY) * 68 + 10;
    const width = Math.max((node.bounds!.width / spanX) * 72, 16);
    const minHeight = Math.max((node.bounds!.height / spanY) * 88, 30);
    const fillColor = safePreviewColor(node.visual?.fillColor);
    const lineColor = safePreviewColor(node.visual?.lineColor);

    return {
      ...node,
      center: {
        x: left + width / 2,
        y: top + minHeight / 2,
      },
      style: {
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        minHeight: `${minHeight}px`,
        zIndex: 1,
        ...(lineColor ? { borderColor: lineColor } : {}),
        ...(fillColor
          ? {
              backgroundColor: `color-mix(in srgb, ${fillColor} 13%, var(--pc-bg-surface))`,
            }
          : {}),
      },
    };
  });
  const nodeCenters = new Map(positionedNodes.map((node) => [node.id, node.center]));

  return {
    nodes: positionedNodes,
    edges: edges
      .map((edge) => {
        const source = nodeCenters.get(edge.sourceId);
        const target = nodeCenters.get(edge.targetId);

        return source && target
          ? {
              id: edge.id,
              x1: source.x,
              y1: source.y,
              x2: target.x,
              y2: target.y,
            }
          : undefined;
      })
      .filter((edge): edge is { id: string; x1: number; y1: number; x2: number; y2: number } =>
        Boolean(edge),
      ),
  };
}

export function computePresetScore(preset: ComputeSizePreset, intent: ComputeSizingIntent): number {
  const vcpuDelta = Math.abs(Math.log2(preset.vcpu / Math.max(intent.vcpu, 1)));
  const memoryDelta = Math.abs(Math.log2(preset.memoryGb / Math.max(intent.memoryGb, 1)));
  const tierPenalty = intent.tier && intent.tier !== preset.tier ? 0.8 : 0;
  const underProvisionPenalty =
    preset.vcpu < intent.vcpu || preset.memoryGb < intent.memoryGb ? 1.2 : 0;

  return vcpuDelta * 2 + memoryDelta * 1.5 + tierPenalty + underProvisionPenalty;
}

export function tokenizeSizingQuery(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let currentKind: 'number' | 'word' | null = null;

  for (const char of value) {
    const kind = sizingTokenKind(char, currentKind);

    if (!kind) {
      if (current) {
        tokens.push(current);
      }

      current = '';
      currentKind = null;
      continue;
    }

    if (currentKind && kind !== currentKind) {
      tokens.push(current);
      current = char;
      currentKind = kind;
      continue;
    }

    current += char;
    currentKind = kind;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function numberNearToken(tokens: string[], targetTokens: string[]): number | undefined {
  const targetSet = new Set(targetTokens);

  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = positiveFormNumber(sizingTokenAt(tokens, index));

    if (
      parsed &&
      (targetSet.has(sizingTokenAt(tokens, index - 1)) ||
        targetSet.has(sizingTokenAt(tokens, index + 1)))
    ) {
      return parsed;
    }
  }

  return undefined;
}

export function memoryGbFromTokens(tokens: string[]): number | undefined {
  const memoryUnits = new Set(['gb', 'gib']);
  const memoryWords = new Set(['ram', 'memory']);

  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = positiveFormNumber(sizingTokenAt(tokens, index));

    if (!parsed) {
      continue;
    }

    const previous = sizingTokenAt(tokens, index - 1);
    const next = sizingTokenAt(tokens, index + 1);
    const secondNext = sizingTokenAt(tokens, index + 2);

    if (
      memoryUnits.has(previous) ||
      memoryUnits.has(next) ||
      memoryWords.has(previous) ||
      memoryWords.has(next) ||
      (memoryWords.has(previous) && memoryUnits.has(next)) ||
      (memoryUnits.has(next) && memoryWords.has(secondNext))
    ) {
      return parsed;
    }
  }

  return undefined;
}

export function computeSizingSignal(suggestion: ComputeSizePreset): string {
  const density = suggestion.memoryGb / Math.max(suggestion.vcpu, 1);
  const densityLabel = `${formatDecimal(density)}GB/vCPU`;

  if (suggestion.tier === 'compute') {
    return `${densityLabel} · CPU value`;
  }

  if (suggestion.tier === 'memory') {
    return `${densityLabel} · memory value`;
  }

  if (suggestion.tier === 'accelerated') {
    return `${densityLabel} · accelerator class`;
  }

  return `${densityLabel} · cost/spec signal`;
}

export function serviceFamilySearchText(family: CloudServiceFamily): string {
  return [
    family.id,
    family.label,
    family.categoryId,
    ...PROVIDER_ORDER.flatMap((providerId) => providerServicesForFamily(family, providerId)),
  ].join(' ');
}

export function serviceFamilyOptionLabel(family: CloudServiceFamily): string {
  const secondary = PROVIDER_ORDER.map(
    (providerId) => providerServicesForFamily(family, providerId)[0],
  )
    .filter(Boolean)
    .join(' / ');

  return `${family.label} - ${secondary}`;
}

export function compactRequirementSummary(
  form: WorkloadFormState,
  regionCatalog: RegionCatalogResponse | null,
): string {
  const workload = workloadTypeLabel(form.workloadType);
  const vcpu = form.vcpu.trim() || '0';
  const memory = form.memoryGb.trim() || '0';
  const region = regionLabelForSummary(form.regionPreference, regionCatalog);
  const service = serviceFamilyShortLabel(form.selectedServiceFamilyId);

  return `${workload} · ${service} · ${vcpu} vCPU · ${memory}GB · ${region}`;
}

export function formatCompactInput(value: string): string {
  const parsed = parseFormNumber(value);

  if (parsed === undefined) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: parsed >= 1000 ? 1 : 0,
    notation: parsed >= 1000 ? 'compact' : 'standard',
  }).format(parsed);
}

export function chartPoint(
  month: number,
  cost: number,
  horizonMonths: number,
  maxCost: number,
): { x: number; y: number } {
  const left = 42;
  const right = 334;
  const top = 28;
  const bottom = 142;
  const x = left + (month / horizonMonths) * (right - left);
  const y = bottom - (cost / maxCost) * (bottom - top);

  return {
    x: roundChartCoordinate(x),
    y: roundChartCoordinate(y),
  };
}

export function costComponentForCategory(category: ServiceCategory): CostComponent {
  return category === 'network' ? 'egress' : category;
}

export function missingCostMatrixCell(caveat: string): CostMatrixCell {
  return {
    available: false,
    caveat,
  };
}

export function costMatrixCellForLineItem(
  lineItem: ComparisonLineItem,
  pricingModel: PricingModelKey,
): CostMatrixCell {
  if (pricingModel === 'on-demand') {
    return {
      available: true,
      monthlyCostUsd: lineItem.baseMonthlyCostUsd,
      caveat: 'Base monthly line item cost.',
    };
  }

  const model = lineItem.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (!model) {
    return {
      available: false,
      caveat: 'Service-level pricing model not present in the backend response.',
    };
  }

  if (!model.available || model.monthlyCostUsd === undefined) {
    return {
      available: false,
      caveat: model.unavailableReason ?? model.caveat ?? 'Pricing model unavailable.',
    };
  }

  return {
    available: true,
    monthlyCostUsd: model.monthlyCostUsd,
    estimated: model.estimated,
    caveat: model.caveat ?? model.providerTerm ?? model.displayName,
  };
}

export function costMatrixSortKey(
  providerId: ProviderId,
  pricingModel: PricingModelKey,
): CostMatrixSortKey {
  return `${providerId}:${pricingModel}`;
}

export function computeFamilyLabel(
  profile: ComputeSpecificationProfile,
  architecture: WorkloadFormState['processorArchitecture'],
): string {
  if (architecture === 'gpu') {
    return profile.gpuFamily ?? profile.x86Family;
  }

  return architecture === 'arm64' ? profile.armFamily : profile.x86Family;
}

export function computeTenancySignal(
  form: WorkloadFormState,
  vcpu: number,
  activeInstances: number,
): string {
  if (form.computeTenancy === 'shared') {
    return 'Shared tenancy; validate placement only for regulated or noisy-neighbor-sensitive workloads.';
  }

  const instancesPerReferenceHost = Math.max(1, Math.floor(64 / Math.max(1, vcpu)));
  const referenceHosts = Math.max(1, Math.ceil(activeInstances / instancesPerReferenceHost));

  return `${form.computeTenancy === 'dedicated-host' ? 'Dedicated host' : 'Sole-tenant node'} · ${formatDecimal(
    instancesPerReferenceHost,
  )} instance(s) per 64-vCPU reference host · ${formatDecimal(referenceHosts)} host(s) at peak.`;
}

export function computeSpecificationRecommendation(
  form: WorkloadFormState,
  architecture: WorkloadFormState['processorArchitecture'],
  providerId: ProviderId,
): string {
  if (architecture === 'gpu') {
    return 'Validate accelerator family, quota, framework compatibility, and storage ingress before choosing on price.';
  }

  if (form.computeTenancy !== 'shared') {
    return 'Validate host density and license/compliance placement before accepting the per-instance comparison.';
  }

  if (architecture === 'x86_64') {
    return `Run an ARM portability check against ${providerLabel(
      providerId,
    )}; the modeled delta is large enough to review.`;
  }

  return 'Keep x86 fallback sizing in the proposal for packages that are not ARM-ready.';
}

export function databaseStorageLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'database' &&
      ['storage', 'backup', 'growth', 'iops', 'replica transfer', 'replication'].some((needle) =>
        `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase().includes(needle),
      ),
  );
}

export function storageDimensionTotals(
  lineItems: ComparisonLineItem[],
): Record<
  'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance',
  number
> {
  return lineItems.reduce(
    (totals, lineItem) => {
      const normalized = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();
      const amount = lineItem.baseMonthlyCostUsd;

      if (normalized.includes('snapshot') || normalized.includes('backup')) {
        totals.snapshot += amount;
      } else if (normalized.includes('retrieval') || normalized.includes('rehydrat')) {
        totals.retrieval += amount;
      } else if (normalized.includes('replication') || normalized.includes('replica transfer')) {
        totals.replication += amount;
      } else if (
        normalized.includes('lifecycle') ||
        normalized.includes('transition') ||
        normalized.includes('minimum-duration')
      ) {
        totals.lifecycle += amount;
      } else if (
        normalized.includes('iops') ||
        normalized.includes('throughput') ||
        normalized.includes('performance') ||
        normalized.includes('multi-attach')
      ) {
        totals.performance += amount;
      } else if (
        normalized.includes('operation') ||
        normalized.includes('request') ||
        normalized.includes('monitoring') ||
        normalized.includes('put') ||
        normalized.includes('get') ||
        normalized.includes('list') ||
        normalized.includes('delete')
      ) {
        totals.operations += amount;
      } else {
        totals.base += amount;
      }

      return totals;
    },
    {
      base: 0,
      operations: 0,
      retrieval: 0,
      replication: 0,
      lifecycle: 0,
      snapshot: 0,
      performance: 0,
    },
  );
}

export function storageOperationsSignal(input: {
  objectCountThousand: number;
  operationMonthly: number;
  requestThousands: number;
  retrievalGb: number;
  retrievalMonthly: number;
}): string {
  const parts = [
    input.requestThousands > 0
      ? `${formatDecimal(input.requestThousands)}K ops (${formatCurrency(input.operationMonthly)}/mo)`
      : undefined,
    input.retrievalGb > 0
      ? `${formatDecimal(input.retrievalGb)}GB retrieval (${formatCurrency(input.retrievalMonthly)}/mo)`
      : undefined,
    input.objectCountThousand > 0
      ? `${formatDecimal(input.objectCountThousand)}K monitored objects`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'No request/retrieval surcharge surfaced';
}

export function storageResilienceSignal(input: {
  lifecycleMonthly: number;
  lifecycleTransitions: number;
  objectRetentionDays: number;
  replicationMonthly: number;
  snapshotMonthly: number;
  snapshotRetentionDays: number;
  snapshotSizeGb: number;
  storageReplication: WorkloadFormState['storageReplication'];
}): string {
  const parts = [
    input.storageReplication !== 'none'
      ? `${input.storageReplication.replace('-', ' ')} (${formatCurrency(
          input.replicationMonthly,
        )}/mo)`
      : undefined,
    input.snapshotSizeGb > 0
      ? `${formatDecimal(input.snapshotSizeGb)}GB snapshots / ${formatDecimal(
          input.snapshotRetentionDays,
        )}d (${formatCurrency(input.snapshotMonthly)}/mo)`
      : undefined,
    input.lifecycleTransitions > 0
      ? `${formatDecimal(input.lifecycleTransitions)}K lifecycle transitions (${formatCurrency(
          input.lifecycleMonthly,
        )}/mo)`
      : undefined,
    input.objectRetentionDays > 0
      ? `${formatDecimal(input.objectRetentionDays)}d object retention`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'No replication/snapshot/lifecycle rows';
}

export function storagePerformanceSignal(input: {
  databaseGrowthGb: number;
  databaseSizeGb: number;
  multiAttachEnabled: boolean;
  performanceMonthly: number;
  provisionedIops: number;
  provisionedThroughputMbps: number;
}): string {
  const annualGrowthPercent =
    input.databaseSizeGb > 0 ? (input.databaseGrowthGb * 12 * 100) / input.databaseSizeGb : 0;
  const parts = [
    input.provisionedIops > 0 || input.provisionedThroughputMbps > 0
      ? `${formatDecimal(input.provisionedIops)} IOPS / ${formatDecimal(
          input.provisionedThroughputMbps,
        )} MB/s (${formatCurrency(input.performanceMonthly)}/mo)`
      : undefined,
    input.multiAttachEnabled
      ? `multi-attach enabled (${formatCurrency(input.performanceMonthly)}/mo)`
      : undefined,
    input.databaseGrowthGb > 0
      ? `${formatDecimal(input.databaseGrowthGb)}GB/mo DB growth (${formatPercent(
          annualGrowthPercent,
        )} annualized)`
      : undefined,
  ].filter(Boolean);

  return parts.join(' · ') || 'Baseline storage performance only';
}

export function storageRateEvidence(lineItem: ComparisonLineItem | undefined): string {
  if (!lineItem) {
    return 'Storage pricing row pending';
  }

  if (lineItem.unitPriceUsd !== undefined) {
    return `${formatCurrency(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'}`;
  }

  if (lineItem.baseHourlyCostUsd !== undefined) {
    return `${formatCurrency(lineItem.baseHourlyCostUsd)}/hr x ${HOURS_PER_MONTH} hrs`;
  }

  return `${lineItem.description} is the largest storage-related row`;
}

export function storageOptimizationSignal(
  primary: ComparisonLineItem,
  storageMonthly: number,
  context: {
    lifecycleTransitions: number;
    multiAttachEnabled: boolean;
    objectCountThousand: number;
    objectRetentionDays: number;
    provisionedIops: number;
    provisionedThroughputMbps: number;
    requestThousands: number;
    retrievalGb: number;
    snapshotRetentionDays: number;
    snapshotSizeGb: number;
    storageClassLabel: string;
    storageReplication: WorkloadFormState['storageReplication'];
  },
): Omit<
  StorageOptimizationRow,
  'providerId' | 'storageMonthly' | 'storageSharePercent' | 'usageSignal' | 'annualSavings'
> {
  const normalizedPrimary = `${primary.skuId ?? ''} ${primary.description}`.toLowerCase();
  const primaryMonthly =
    primary.baseMonthlyCostUsd > 0 ? primary.baseMonthlyCostUsd : storageMonthly;
  const baseEvidence = `${primary.description} is the largest storage row at ${formatCurrency(
    primaryMonthly,
  )}/mo.`;

  if (normalizedPrimary.includes('snapshot')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      primaryDriver: 'Snapshot retention',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Reduce retention, deduplicate snapshots, or move older copies to colder tiers.',
      driverEvidence:
        context.snapshotSizeGb > 0
          ? `${formatDecimal(context.snapshotSizeGb)}GB snapshots · ${formatDecimal(
              context.snapshotRetentionDays,
            )} days`
          : 'Snapshot line item surfaced by backend',
      evidence: `${baseEvidence} Retention pruning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('minimum-duration')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Minimum-duration exposure',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Keep objects in the cold/archive class for the billable minimum or adjust lifecycle timing.',
      driverEvidence:
        context.objectRetentionDays > 0
          ? `${formatDecimal(context.objectRetentionDays)}d planned retention · ${
              context.storageClassLabel
            }`
          : 'Minimum-duration line item surfaced by backend',
      evidence: `${baseEvidence} Lifecycle timing review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('retrieval') || normalizedPrimary.includes('archive')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Retrieval / archive access',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Validate retrieval frequency before moving warm data into archive classes.',
      driverEvidence:
        context.retrievalGb > 0
          ? `${formatDecimal(context.retrievalGb)}GB monthly retrieval · ${
              context.storageClassLabel
            }`
          : `${context.storageClassLabel} storage class`,
      evidence: `${baseEvidence} Retrieval and archive tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('replication')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      primaryDriver: 'Replication policy',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Re-check cross-region replication scope against the actual DR requirement.',
      driverEvidence:
        context.storageReplication !== 'none'
          ? `${context.storageReplication.replace('-', ' ')} configured`
          : 'Replication line item surfaced by backend',
      evidence: `${baseEvidence} Replication policy review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('iops') ||
    normalizedPrimary.includes('throughput') ||
    normalizedPrimary.includes('performance') ||
    normalizedPrimary.includes('multi-attach')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Provisioned performance',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Right-size provisioned IOPS, throughput, and multi-attach placement after observing latency and failover needs.',
      driverEvidence: context.multiAttachEnabled
        ? 'Block multi-attach enabled'
        : context.provisionedIops > 0 || context.provisionedThroughputMbps > 0
          ? `${formatDecimal(context.provisionedIops)} IOPS · ${formatDecimal(
              context.provisionedThroughputMbps,
            )} MB/s`
          : 'Performance line item surfaced by backend',
      evidence: `${baseEvidence} Performance right-sizing models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('request') ||
    normalizedPrimary.includes('monitoring') ||
    normalizedPrimary.includes('put') ||
    normalizedPrimary.includes('get') ||
    normalizedPrimary.includes('list') ||
    normalizedPrimary.includes('delete')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Request operations',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Batch object operations and reduce LIST-heavy access paths before scaling.',
      driverEvidence:
        context.objectCountThousand > 0 && normalizedPrimary.includes('monitoring')
          ? `${formatDecimal(context.objectCountThousand)}K monitored objects`
          : context.requestThousands > 0
            ? `${formatDecimal(context.requestThousands)}K monthly operations`
            : 'Request operation line item surfaced by backend',
      evidence: `${baseEvidence} Request-shape tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('lifecycle')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      primaryDriver: 'Lifecycle transitions',
      monthlySavings,
      effort: 'Low',
      recommendation: 'Validate lifecycle transition frequency and minimum-duration break-even.',
      driverEvidence:
        context.lifecycleTransitions > 0
          ? `${formatDecimal(context.lifecycleTransitions)}K transitions/month`
          : 'Lifecycle line item surfaced by backend',
      evidence: `${baseEvidence} Lifecycle-rule cleanup models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  const monthlySavings = roundCurrency(storageMonthly * 0.15);

  return {
    primaryDriver: 'Storage tiering',
    monthlySavings,
    effort: 'Low',
    recommendation: 'Review storage class, lifecycle policy, and growth assumptions.',
    driverEvidence: `${context.storageClassLabel} baseline · ${formatCurrency(
      storageMonthly,
    )}/mo storage`,
    evidence: `Storage class review models ${formatCurrency(
      monthlySavings,
    )}/mo opportunity at 15% of the storage baseline.`,
  };
}

export function databaseDimensionTotals(
  lineItems: ComparisonLineItem[],
): Record<
  | 'base'
  | 'nosql'
  | 'ru'
  | 'query'
  | 'warehouse'
  | 'search'
  | 'cache'
  | 'backup'
  | 'replica'
  | 'performance',
  number
> {
  return lineItems.reduce(
    (totals, lineItem) => {
      const normalized = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();
      const amount = lineItem.baseMonthlyCostUsd;

      if (normalized.includes('ru') || normalized.includes('cosmos')) {
        totals.ru += amount;
      } else if (
        normalized.includes('nosql') ||
        normalized.includes('read unit') ||
        normalized.includes('write unit')
      ) {
        totals.nosql += amount;
      } else if (
        normalized.includes('search') ||
        normalized.includes('opensearch') ||
        normalized.includes('cognitive search') ||
        normalized.includes('azure ai search') ||
        normalized.includes('cloud search') ||
        normalized.includes('vertex ai search')
      ) {
        totals.search += amount;
      } else if (
        normalized.includes('warehouse') ||
        normalized.includes('bigquery') ||
        normalized.includes('redshift') ||
        normalized.includes('synapse')
      ) {
        totals.warehouse += amount;
      } else if (normalized.includes('query')) {
        totals.query += amount;
      } else if (normalized.includes('cache') || normalized.includes('redis')) {
        totals.cache += amount;
      } else if (normalized.includes('backup') || normalized.includes('growth')) {
        totals.backup += amount;
      } else if (
        normalized.includes('replica') ||
        normalized.includes('standby') ||
        normalized.includes('multi-az')
      ) {
        totals.replica += amount;
      } else if (normalized.includes('iops') || normalized.includes('performance')) {
        totals.performance += amount;
      } else {
        totals.base += amount;
      }

      return totals;
    },
    {
      base: 0,
      nosql: 0,
      ru: 0,
      query: 0,
      warehouse: 0,
      search: 0,
      cache: 0,
      backup: 0,
      replica: 0,
      performance: 0,
    },
  );
}

export function databaseRateEvidence(lineItem: ComparisonLineItem | undefined): string {
  if (!lineItem) {
    return 'Database pricing row pending';
  }

  if (lineItem.unitPriceUsd !== undefined) {
    return `${formatCurrency(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'}`;
  }

  if (lineItem.baseHourlyCostUsd !== undefined) {
    return `${formatCurrency(lineItem.baseHourlyCostUsd)}/hr x ${HOURS_PER_MONTH} hrs`;
  }

  return `${lineItem.description} is the largest database-related row`;
}

export function databaseOptimizationSignal(
  primary: ComparisonLineItem,
  databaseMonthly: number,
  context: {
    backupDays: number;
    backupGb: number;
    cacheReplicas: number;
    databaseEngineLabel: string;
    nosqlReadsMillion: number;
    nosqlWritesMillion: number;
    provisionedIops: number;
    queryDataTb: number;
    readReplicas: number;
    replicaTransferGb: number;
    ruPerSecond: number;
    searchNodes: number;
    searchQueriesMillion: number;
    searchStorageGb: number;
    storageGrowthGb: number;
    warehouseStorageGb: number;
  },
): Omit<
  DatabaseOptimizationRow,
  'providerId' | 'databaseMonthly' | 'databaseSharePercent' | 'usageSignal' | 'annualSavings'
> {
  const normalizedPrimary = `${primary.skuId ?? ''} ${primary.description}`.toLowerCase();
  const primaryMonthly =
    primary.baseMonthlyCostUsd > 0 ? primary.baseMonthlyCostUsd : databaseMonthly;
  const baseEvidence = `${primary.description} is the largest database row at ${formatCurrency(
    primaryMonthly,
  )}/mo.`;

  if (normalizedPrimary.includes('ru') || normalizedPrimary.includes('cosmos')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'RU/s provisioned capacity',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Validate RU/s utilization, autoscale limits, and serverless break-even.',
      driverEvidence:
        context.ruPerSecond > 0
          ? `${formatDecimal(context.ruPerSecond)} RU/s configured`
          : 'RU/s line item surfaced by backend',
      evidence: `${baseEvidence} RU/s right-sizing models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('nosql') ||
    normalizedPrimary.includes('read unit') ||
    normalizedPrimary.includes('write unit')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'NoSQL capacity units',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Compare on-demand and provisioned capacity before choosing NoSQL mode.',
      driverEvidence:
        context.nosqlReadsMillion + context.nosqlWritesMillion > 0
          ? `${formatDecimal(context.nosqlReadsMillion)}M reads · ${formatDecimal(
              context.nosqlWritesMillion,
            )}M writes`
          : `${context.databaseEngineLabel} capacity line item`,
      evidence: `${baseEvidence} Capacity-mode review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('search') ||
    normalizedPrimary.includes('opensearch') ||
    normalizedPrimary.includes('cognitive search') ||
    normalizedPrimary.includes('azure ai search') ||
    normalizedPrimary.includes('cloud search') ||
    normalizedPrimary.includes('vertex ai search')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.22);

    return {
      primaryDriver: 'Managed search capacity',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Right-size search replicas, index lifecycle, and query capacity before scaling search clusters.',
      driverEvidence:
        context.searchNodes + context.searchStorageGb + context.searchQueriesMillion > 0
          ? `${formatDecimal(context.searchNodes)} nodes · ${formatDecimal(
              context.searchStorageGb,
            )}GB index · ${formatDecimal(context.searchQueriesMillion)}M queries`
          : 'Search service line item surfaced by backend',
      evidence: `${baseEvidence} Managed-search tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('query') ||
    normalizedPrimary.includes('warehouse') ||
    normalizedPrimary.includes('bigquery') ||
    normalizedPrimary.includes('redshift') ||
    normalizedPrimary.includes('synapse')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Warehouse query processing',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Partition hot datasets and compare on-demand query spend with committed slots.',
      driverEvidence:
        context.queryDataTb > 0
          ? `${formatDecimal(context.queryDataTb)}TB query · ${formatDecimal(
              context.warehouseStorageGb,
            )}GB warehouse storage`
          : 'Query processing line item surfaced by backend',
      evidence: `${baseEvidence} Warehouse/query tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('iops') || normalizedPrimary.includes('performance')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Database IOPS',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Right-size provisioned IOPS using observed latency and queue-depth data.',
      driverEvidence:
        context.provisionedIops > 0
          ? `${formatDecimal(context.provisionedIops)} provisioned IOPS`
          : 'IOPS line item surfaced by backend',
      evidence: `${baseEvidence} IOPS tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('replica') ||
    normalizedPrimary.includes('standby') ||
    normalizedPrimary.includes('multi-az')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Replicas / HA standby',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Validate read-replica count and standby topology against RPO/RTO needs.',
      driverEvidence:
        context.readReplicas + context.cacheReplicas > 0 || context.replicaTransferGb > 0
          ? `${formatDecimal(context.readReplicas)} read replicas · ${formatDecimal(
              context.replicaTransferGb,
            )}GB transfer`
          : 'Replica or standby line item surfaced by backend',
      evidence: `${baseEvidence} Replica and standby review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('backup') || normalizedPrimary.includes('growth')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Backup / growth policy',
      monthlySavings,
      effort: 'Low',
      recommendation: 'Tune backup retention, archive policy, and storage autoscaling thresholds.',
      driverEvidence:
        context.backupGb > 0 || context.storageGrowthGb > 0
          ? `${formatDecimal(context.backupGb)}GB backup · ${formatDecimal(
              context.backupDays,
            )} days · ${formatDecimal(context.storageGrowthGb)}GB/mo growth`
          : 'Backup or growth line item surfaced by backend',
      evidence: `${baseEvidence} Backup/growth policy tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('cache') || normalizedPrimary.includes('redis')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Cache topology',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Right-size cache replicas, TTLs, and failover topology before scaling Redis.',
      driverEvidence:
        context.cacheReplicas > 0
          ? `${formatDecimal(context.cacheReplicas)} cache replicas`
          : 'Cache line item surfaced by backend',
      evidence: `${baseEvidence} Cache topology tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  const monthlySavings = roundCurrency(databaseMonthly * 0.15);

  return {
    primaryDriver: 'Managed database tiering',
    monthlySavings,
    effort: 'Low',
    recommendation: 'Review managed tier, HA posture, storage growth, and query profile.',
    driverEvidence: `${context.databaseEngineLabel} baseline · ${formatCurrency(
      databaseMonthly,
    )}/mo database/analytics spend`,
    evidence: `Database tier review models ${formatCurrency(
      monthlySavings,
    )}/mo opportunity at 15% of the database baseline.`,
  };
}

export function runtimeIntelligenceLineItems(
  provider: ComparisonProviderResult,
): ComparisonLineItem[] {
  return provider.lineItems.filter((lineItem) =>
    runtimeDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
}

export function runtimeOptimizationSignal(
  primary: ComparisonLineItem,
  runtimeMonthly: number,
  context: {
    functionDurationMs: number;
    functionInvocationsMillion: number;
    functionMemoryMb: number;
    appPlatformMemoryGb: number;
    appPlatformRequestDurationMs: number;
    appPlatformRequestsMillion: number;
    appPlatformVcpu: number;
    kubernetesClusterCount: number;
    kubernetesWorkerNodeCount: number;
    registryEgressGb: number;
    registryStorageGb: number;
  },
): Omit<
  RuntimeOptimizationRow,
  'providerId' | 'runtimeMonthly' | 'runtimeSharePercent' | 'usageSignal' | 'annualSavings'
> {
  const normalizedPrimary = `${primary.skuId ?? ''} ${primary.description}`.toLowerCase();
  const primaryMonthly =
    primary.baseMonthlyCostUsd > 0 ? primary.baseMonthlyCostUsd : runtimeMonthly;
  const baseEvidence = `${primary.description} is the largest runtime row at ${formatCurrency(
    primaryMonthly,
  )}/mo.`;

  if (normalizedPrimary.includes('app platform')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Managed app platform shape',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Compare request-based scale-to-zero with always-on/provisioned app capacity before selecting the runtime posture.',
      driverEvidence:
        context.appPlatformRequestsMillion > 0
          ? `${formatDecimal(context.appPlatformRequestsMillion)}M app requests · ${formatDecimal(
              context.appPlatformRequestDurationMs,
            )}ms @ ${formatDecimal(context.appPlatformVcpu)} vCPU / ${formatDecimal(
              context.appPlatformMemoryGb,
            )}GB`
          : 'App platform line item surfaced by backend',
      evidence: `${baseEvidence} App-platform posture review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('gb-second') || normalizedPrimary.includes('duration')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Function duration / memory',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Tune the memory-duration knee and compare functions with always-on containers for steady traffic.',
      driverEvidence:
        context.functionInvocationsMillion > 0
          ? `${formatDecimal(context.functionInvocationsMillion)}M invocations · ${formatDecimal(
              context.functionDurationMs,
            )}ms @ ${formatDecimal(context.functionMemoryMb)}MB`
          : 'Function duration line item surfaced by backend',
      evidence: `${baseEvidence} Function runtime tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('request') || normalizedPrimary.includes('invocation')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Function invocations',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Batch event triggers, reduce retries, and reserve provisioned concurrency only for latency-critical paths.',
      driverEvidence:
        context.functionInvocationsMillion > 0
          ? `${formatDecimal(context.functionInvocationsMillion)}M monthly invocations`
          : 'Function request line item surfaced by backend',
      evidence: `${baseEvidence} Invocation-shape tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('control plane')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      primaryDriver: 'Kubernetes control plane',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Validate cluster count and shared platform model before accepting per-cluster overhead.',
      driverEvidence:
        context.kubernetesClusterCount > 0
          ? `${formatDecimal(context.kubernetesClusterCount)} managed clusters`
          : 'Kubernetes control-plane line item surfaced by backend',
      evidence: `${baseEvidence} Cluster consolidation review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (
    normalizedPrimary.includes('node overhead') ||
    normalizedPrimary.includes('kubernetes node') ||
    normalizedPrimary.includes('networking/operations')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Kubernetes node overhead',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Right-size worker nodes and autoscaling, or compare managed serverless containers for small services.',
      driverEvidence:
        context.kubernetesWorkerNodeCount > 0
          ? `${formatDecimal(context.kubernetesWorkerNodeCount)} worker nodes`
          : 'Kubernetes node overhead line item surfaced by backend',
      evidence: `${baseEvidence} Node overhead tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('registry egress')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      primaryDriver: 'Registry image egress',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Keep image pulls regional, use pull-through cache, and avoid cross-region image transfer.',
      driverEvidence:
        context.registryEgressGb > 0
          ? `${formatDecimal(context.registryEgressGb)}GB registry egress`
          : 'Registry egress line item surfaced by backend',
      evidence: `${baseEvidence} Registry locality review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('registry storage')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      primaryDriver: 'Registry image retention',
      monthlySavings,
      effort: 'Low',
      recommendation: 'Enforce image lifecycle retention for old tags, digests, and build caches.',
      driverEvidence:
        context.registryStorageGb > 0
          ? `${formatDecimal(context.registryStorageGb)}GB registry storage`
          : 'Registry storage line item surfaced by backend',
      evidence: `${baseEvidence} Registry cleanup models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  const monthlySavings = roundCurrency(runtimeMonthly * 0.15);

  return {
    primaryDriver: 'Runtime platform fit',
    monthlySavings,
    effort: 'Medium',
    recommendation:
      'Review function, container, and orchestration fit against traffic shape before standardizing the platform.',
    driverEvidence: `${formatCurrency(runtimeMonthly)}/mo serverless/container spend`,
    evidence: `Runtime platform review models ${formatCurrency(
      monthlySavings,
    )}/mo opportunity at 15% of the runtime baseline.`,
  };
}

export function operationsIntelligenceLineItems(
  provider: ComparisonProviderResult,
): ComparisonLineItem[] {
  return provider.lineItems.filter((lineItem) =>
    operationsDescriptionMatches(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
}

export function operationsOptimizationSignal(
  primary: ComparisonLineItem,
  operationsMonthly: number,
  context: {
    ddosProtectedResources: number;
    observabilityAlarms: number;
    observabilityDashboards: number;
    observabilityLogRetentionGb: number;
    observabilityLogsIngestGb: number;
    observabilityMetricsMillion: number;
    observabilityTracesMillion: number;
    secretApiCallsTenThousand: number;
    secretsCount: number;
    securityFindingsThousand: number;
    securityProtectedResources: number;
    wafRequestsMillion: number;
    wafRuleCount: number;
    wafWebAclCount: number;
  },
): Omit<
  OperationsOptimizationRow,
  'providerId' | 'operationsMonthly' | 'operationsSharePercent' | 'usageSignal' | 'annualSavings'
> {
  const normalizedPrimary = `${primary.skuId ?? ''} ${primary.description}`.toLowerCase();
  const primaryMonthly =
    primary.baseMonthlyCostUsd > 0 ? primary.baseMonthlyCostUsd : operationsMonthly;
  const baseEvidence = `${primary.description} is the largest operations row at ${formatCurrency(
    primaryMonthly,
  )}/mo.`;

  if (normalizedPrimary.includes('log ingestion')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      primaryDriver: 'Log ingestion volume',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Filter debug noise at source, sample high-volume streams, and route low-value logs to cheaper retention.',
      driverEvidence:
        context.observabilityLogsIngestGb > 0
          ? `${formatDecimal(context.observabilityLogsIngestGb)}GB logs ingested/month`
          : 'Log ingestion line item surfaced by backend',
      evidence: `${baseEvidence} Log filtering models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('log retention')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      primaryDriver: 'Log retention storage',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Shorten hot retention, export compliance logs to archive storage, and delete duplicate streams.',
      driverEvidence:
        context.observabilityLogRetentionGb > 0
          ? `${formatDecimal(context.observabilityLogRetentionGb)}GB-month retained logs`
          : 'Log retention line item surfaced by backend',
      evidence: `${baseEvidence} Retention policy tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('metric')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'Custom metric cardinality',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Reduce high-cardinality labels and aggregate custom metrics before they multiply across services.',
      driverEvidence:
        context.observabilityMetricsMillion > 0
          ? `${formatDecimal(context.observabilityMetricsMillion)}M metric samples/month`
          : 'Metric line item surfaced by backend',
      evidence: `${baseEvidence} Cardinality cleanup models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('trace')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      primaryDriver: 'Trace/APM sampling',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Sample traces by route and error rate instead of retaining every successful request path.',
      driverEvidence:
        context.observabilityTracesMillion > 0
          ? `${formatDecimal(context.observabilityTracesMillion)}M traces/month`
          : 'Trace line item surfaced by backend',
      evidence: `${baseEvidence} Trace sampling models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('dashboard')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Dashboard footprint',
      monthlySavings,
      effort: 'Low',
      recommendation: 'Consolidate duplicate dashboards and keep persona-specific views only.',
      driverEvidence:
        context.observabilityDashboards > 0
          ? `${formatDecimal(context.observabilityDashboards)} dashboards`
          : 'Dashboard line item surfaced by backend',
      evidence: `${baseEvidence} Dashboard consolidation models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('alarm')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Alarm rule count',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Group low-value alarms into composite policies and reserve paging alerts for actionable symptoms.',
      driverEvidence:
        context.observabilityAlarms > 0
          ? `${formatDecimal(context.observabilityAlarms)} alarm rules`
          : 'Alarm line item surfaced by backend',
      evidence: `${baseEvidence} Alarm policy cleanup models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('secret api')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Secret API calls',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Cache secrets safely inside runtime boundaries and remove polling loops that re-read unchanged values.',
      driverEvidence:
        context.secretApiCallsTenThousand > 0
          ? `${formatDecimal(context.secretApiCallsTenThousand)} x 10k secret calls/month`
          : 'Secret API line item surfaced by backend',
      evidence: `${baseEvidence} Secret call reduction models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('secret')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      primaryDriver: 'Managed secret inventory',
      monthlySavings,
      effort: 'Low',
      recommendation:
        'Retire stale secrets, consolidate duplicate environment keys, and keep rotation policy tied to ownership tags.',
      driverEvidence:
        context.secretsCount > 0
          ? `${formatDecimal(context.secretsCount)} managed secrets`
          : 'Managed secrets line item surfaced by backend',
      evidence: `${baseEvidence} Secret inventory cleanup models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('ddos')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      primaryDriver: 'DDoS protection baseline',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Validate which public endpoints truly need advanced DDoS protection versus baseline provider protection.',
      driverEvidence:
        context.ddosProtectedResources > 0
          ? `${formatDecimal(context.ddosProtectedResources)} protected resources`
          : 'DDoS protection line item surfaced by backend',
      evidence: `${baseEvidence} Protection-scope review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('waf request')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      primaryDriver: 'WAF request inspection',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Scope WAF inspection to exposed paths and tune managed rules before every request pays inspection cost.',
      driverEvidence:
        context.wafRequestsMillion > 0
          ? `${formatDecimal(context.wafRequestsMillion)}M inspected requests/month`
          : 'WAF request line item surfaced by backend',
      evidence: `${baseEvidence} WAF request tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('waf')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'WAF rule footprint',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Remove duplicate WAF rules and consolidate web ACLs around shared managed rule groups.',
      driverEvidence:
        context.wafWebAclCount + context.wafRuleCount > 0
          ? `${formatDecimal(context.wafWebAclCount)} ACLs · ${formatDecimal(
              context.wafRuleCount,
            )} rules`
          : 'WAF line item surfaced by backend',
      evidence: `${baseEvidence} WAF rule review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  if (normalizedPrimary.includes('security posture') || normalizedPrimary.includes('finding')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      primaryDriver: 'Security posture scope',
      monthlySavings,
      effort: 'Medium',
      recommendation:
        'Scope posture scanning to production assets first and suppress duplicate low-value findings.',
      driverEvidence:
        context.securityProtectedResources + context.securityFindingsThousand > 0
          ? `${formatDecimal(context.securityProtectedResources)} resources · ${formatDecimal(
              context.securityFindingsThousand,
            )}k findings`
          : 'Security posture line item surfaced by backend',
      evidence: `${baseEvidence} Security scope review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity.`,
    };
  }

  const monthlySavings = roundCurrency(operationsMonthly * 0.15);

  return {
    primaryDriver: 'Operations service footprint',
    monthlySavings,
    effort: 'Medium',
    recommendation:
      'Review monitoring, logging, secrets, and security controls as explicit production cost centers.',
    driverEvidence: `${formatCurrency(operationsMonthly)}/mo operations spend`,
    evidence: `Operations service review models ${formatCurrency(
      monthlySavings,
    )}/mo opportunity at 15% of the operations baseline.`,
  };
}

export function networkingComponentLabel(lineItem: ComparisonLineItem): string {
  const normalized = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();

  if (normalized.includes('load balancer')) {
    return 'Load balancer capacity';
  }

  if (normalized.includes('nat')) {
    return 'NAT gateway processing';
  }

  if (normalized.includes('cdn-viewer') || normalized.includes('viewer data transfer')) {
    return 'CDN viewer transfer';
  }

  if (normalized.includes('cdn-origin') || normalized.includes('origin miss')) {
    return 'CDN origin transfer';
  }

  if (normalized.includes('cdn-edge') || normalized.includes('edge request')) {
    return 'CDN edge requests';
  }

  if (normalized.includes('cdn')) {
    return 'CDN delivery';
  }

  if (normalized.includes('dns')) {
    return 'DNS zones and queries';
  }

  if (normalized.includes('vpn')) {
    return 'VPN connectivity';
  }

  if (
    normalized.includes('private circuit') ||
    normalized.includes('direct connect') ||
    normalized.includes('expressroute') ||
    normalized.includes('interconnect')
  ) {
    return 'Private connectivity';
  }

  if (normalized.includes('cross-az')) {
    return 'Cross-AZ transfer';
  }

  if (normalized.includes('inter-region')) {
    return 'Inter-region transfer';
  }

  return lineItem.costComponent === 'egress' ? 'Internet egress' : 'Network charge';
}

export function egressOptimizationSignal(
  primary: ComparisonLineItem,
  egressMonthly: number,
  context: {
    cacheHit: number;
    cdnTrafficGb: number;
    configuredEgressGb: number;
    privateTransferGb: number;
    tieredGb: number;
  },
): Omit<
  EgressOptimizationRow,
  'providerId' | 'egressMonthly' | 'egressSharePercent' | 'trafficSignal'
> {
  const normalizedPrimary = `${primary.skuId ?? ''} ${primary.description}`.toLowerCase();
  const primaryMonthly = primary.baseMonthlyCostUsd;
  const baseEvidence = `${primary.description} is the largest network row at ${formatCurrency(
    primaryMonthly,
  )}/mo.`;

  if (normalizedPrimary.includes('cdn')) {
    const targetCacheHit = 95;
    const cacheGap = Math.max(0, targetCacheHit - context.cacheHit);
    const monthlySavings = roundCurrency(primaryMonthly * clampNumber(cacheGap / 100, 0.05, 0.2));

    return {
      primaryDriver: 'CDN delivery',
      monthlySavings,
      effort: 'Low',
      recommendation: `Raise CDN cache hit toward ${targetCacheHit}% before scaling origin capacity.`,
      driverEvidence:
        context.cdnTrafficGb > 0
          ? `${formatDecimal(context.cdnTrafficGb)}GB CDN traffic · ${formatPercent(
              context.cacheHit,
            )} cache hit`
          : `${formatPercent(context.cacheHit)} cache hit from workload profile`,
      evidence: `${baseEvidence} Cache policy tuning models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity without changing provider selection.`,
    };
  }

  if (normalizedPrimary.includes('nat')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.4);

    return {
      primaryDriver: 'NAT gateway',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Move eligible traffic to private endpoints and remove NAT hairpin paths.',
      driverEvidence:
        context.privateTransferGb > 0
          ? `${formatDecimal(context.privateTransferGb)}GB private-path traffic`
          : 'NAT line item surfaced by backend',
      evidence: `${baseEvidence} Route review models a 40% reduction of the NAT baseline.`,
    };
  }

  if (
    normalizedPrimary.includes('vpn') ||
    normalizedPrimary.includes('private circuit') ||
    normalizedPrimary.includes('direct connect') ||
    normalizedPrimary.includes('expressroute') ||
    normalizedPrimary.includes('interconnect')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);
    const isCircuit =
      normalizedPrimary.includes('private circuit') ||
      normalizedPrimary.includes('direct connect') ||
      normalizedPrimary.includes('expressroute') ||
      normalizedPrimary.includes('interconnect');

    return {
      primaryDriver: isCircuit ? 'Private circuit' : 'VPN connectivity',
      monthlySavings,
      effort: 'High',
      recommendation:
        'Validate port speed, redundancy, metered-vs-unlimited transfer, and VPN-to-private-circuit break-even before final network design.',
      driverEvidence:
        context.privateTransferGb > 0
          ? `${formatDecimal(context.privateTransferGb)}GB private-path traffic`
          : 'Private connectivity line item surfaced by backend',
      evidence: `${baseEvidence} Connectivity architecture review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity at 25% of that private-connectivity baseline.`,
    };
  }

  if (normalizedPrimary.includes('cross-az') || normalizedPrimary.includes('inter-region')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.5);

    return {
      primaryDriver: normalizedPrimary.includes('inter-region')
        ? 'Inter-region transfer'
        : 'Cross-AZ transfer',
      monthlySavings,
      effort: 'Medium',
      recommendation: 'Co-locate chatty services or redesign replication paths before HA sign-off.',
      driverEvidence:
        context.privateTransferGb > 0
          ? `${formatDecimal(context.privateTransferGb)}GB private-path traffic`
          : 'Private transfer line item surfaced by backend',
      evidence: `${baseEvidence} Locality review models a 50% reduction of that transfer path.`,
    };
  }

  if (context.tieredGb >= 10_240 || egressMonthly >= 1000) {
    const monthlySavings = roundCurrency(egressMonthly * 0.25);

    return {
      primaryDriver: 'High-volume data out',
      monthlySavings,
      effort: 'High',
      recommendation: 'Evaluate private connectivity, CDN commitments, and same-region access.',
      driverEvidence:
        context.tieredGb > 0
          ? `${formatDecimal(context.tieredGb)}GB tier-traced egress`
          : `${formatCurrency(egressMonthly)}/mo network exposure`,
      evidence: `High-volume egress review models ${formatCurrency(
        monthlySavings,
      )}/mo opportunity at 25% of the current egress baseline.`,
    };
  }

  const monthlySavings = roundCurrency(egressMonthly * 0.3);

  return {
    primaryDriver: 'Internet egress',
    monthlySavings,
    effort: 'Medium',
    recommendation: 'Evaluate CDN offload, cache-control, and same-region data access.',
    driverEvidence:
      context.configuredEgressGb > 0
        ? `${formatDecimal(context.configuredEgressGb)}GB internet egress configured`
        : 'Network egress line item surfaced by backend',
    evidence: `${baseEvidence} Rule-based review models ${formatCurrency(
      monthlySavings,
    )}/mo at 30% of current egress.`,
  };
}

export function spotInterruptionFrequency(
  providerId: ProviderId,
  risk: SpotBlendOptimizerRow['risk'],
  spotPercent: number,
  volatility?: NonNullable<ComparisonProviderResult['pricingModels']>[number]['volatility'],
): string {
  const band =
    risk === 'High'
      ? 'daily-to-weekly planning band'
      : risk === 'Medium'
        ? 'weekly-to-monthly planning band'
        : 'monthly-or-lower planning band';
  const providerSignal =
    providerId === 'aws'
      ? 'capacity-pool dependent'
      : providerId === 'azure'
        ? 'eviction-policy dependent'
        : 'preemption-policy dependent';
  const volatilitySignal = volatility === 'volatile' ? 'volatile estimate' : 'modeled estimate';

  return `${band} · ${formatPercent(
    spotPercent,
  )} interruptible share · ${providerLabel(providerId)} ${providerSignal} ${volatilitySignal}.`;
}

export function spotBlendWorkloadFit(form: WorkloadFormState, spotPercent: number): string {
  if (form.environment === 'production') {
    return `${capitalize(form.usagePattern.replace('_', ' '))} production workload; keep ${formatPercent(
      100 - spotPercent,
    )} baseline on-demand capacity.`;
  }

  return `${capitalize(form.environment)} ${form.usagePattern.replace(
    '_',
    ' ',
  )} profile can test a higher interruptible blend.`;
}

export function finOpsRiskSeverity(
  severity: ComparisonAnalyticsResponse['finOpsFindings'][number]['severity'],
): ArchitectureRiskFlag['severity'] {
  switch (severity) {
    case 'critical':
    case 'warning':
      return 'high';
    case 'review':
      return 'medium';
    case 'info':
      return 'low';
  }
}

export function riskSeverityRank(severity: ArchitectureRiskFlag['severity']): number {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

export function backendSensitivityScenarioRows(
  rows: ComparisonAnalyticsResponse['sensitivityScenarios'],
): SensitivityScenarioRow[] {
  const groupedRows = rows.reduce((groups, row) => {
    const key = `${row.variable}:${row.changePercent}`;
    const current = groups.get(key) ?? {
      id: key,
      label: `${row.label} ${row.changePercent > 0 ? '+' : ''}${formatPercent(row.changePercent)}`,
      assumption: `Backend analytics varied ${row.label.toLowerCase()} by ${
        row.changePercent > 0 ? '+' : ''
      }${formatPercent(row.changePercent)} against cached dimension totals.`,
      providers: [] as SensitivityScenarioProviderCost[],
    };

    current.providers.push({
      providerId: row.providerId,
      monthlyCostUsd: row.adjustedMonthlyUsd,
      deltaVsBaselineUsd: row.deltaMonthlyUsd,
      isLowest: false,
    });
    groups.set(key, current);

    return groups;
  }, new Map<string, Omit<SensitivityScenarioRow, 'lowestProviderId'> & { providers: SensitivityScenarioProviderCost[] }>());

  return [...groupedRows.values()].map((row) => {
    const providers = row.providers.sort(
      (left, right) =>
        PROVIDER_ORDER.indexOf(left.providerId) - PROVIDER_ORDER.indexOf(right.providerId),
    );
    const lowest = [...providers].sort(
      (left, right) => left.monthlyCostUsd - right.monthlyCostUsd,
    )[0];

    return {
      ...row,
      providers: providers.map((provider) => ({
        ...provider,
        isLowest: provider.providerId === lowest?.providerId,
      })),
      lowestProviderId: lowest?.providerId,
    };
  });
}

export function scenarioSensitivityRow(
  id: string,
  label: string,
  assumption: string,
  providers: ComparisonProviderResult[],
  monthlyCost: (provider: ComparisonProviderResult) => number,
): SensitivityScenarioRow {
  const providerCosts = providers.map((provider) => ({
    providerId: provider.providerId,
    monthlyCostUsd: roundCurrency(monthlyCost(provider)),
    deltaVsBaselineUsd: roundCurrency(monthlyCost(provider) - provider.totals.monthly),
    isLowest: false,
  }));
  const lowest = [...providerCosts].sort(
    (left, right) => left.monthlyCostUsd - right.monthlyCostUsd,
  )[0];

  return {
    id,
    label,
    assumption,
    providers: providerCosts.map((provider) => ({
      ...provider,
      isLowest: lowest?.providerId === provider.providerId,
    })),
    lowestProviderId: lowest?.providerId,
  };
}

export function scenarioWinCounts(rows: SensitivityScenarioRow[]): Map<ProviderId, number> {
  return rows.reduce((counts, row) => {
    if (row.lowestProviderId) {
      counts.set(row.lowestProviderId, (counts.get(row.lowestProviderId) ?? 0) + 1);
    }

    return counts;
  }, new Map<ProviderId, number>());
}

export function storageGrowthSensitivityPercent(form: WorkloadFormState): number {
  const storageGrowthGb = parseInputNumber(form.databaseStorageGrowthGbPerMonth) ?? 0;
  const databaseSizeGb = parseInputNumber(form.databaseSizeGb) ?? 0;
  const storageSizeGb = parseInputNumber(form.storageSizeGb) ?? 0;
  const currentDataFootprintGb = databaseSizeGb + storageSizeGb;

  if (storageGrowthGb <= 0 || currentDataFootprintGb <= 0) {
    return 40;
  }

  return Math.min(
    120,
    Math.max(20, Math.round((storageGrowthGb * 12 * 100) / currentDataFootprintGb)),
  );
}

export function lineItemTierBillableGb(lineItem: ComparisonLineItem): number {
  return lineItem.egressTiers?.reduce((sum, tier) => sum + tier.billableGb, 0) ?? 0;
}

export function lineItemCostComponent(lineItem: ComparisonLineItem): CostComponent {
  if (lineItem.costComponent) {
    return lineItem.costComponent;
  }

  switch (lineItem.category) {
    case 'network':
      return 'egress';
    case 'support':
    case 'licensing':
    case 'operations':
      return lineItem.category;
    case 'compute':
    case 'storage':
    case 'database':
      return lineItem.category;
  }
}

export function costFormulaRows(comparison: ComparisonResult | null): Array<{
  key: string;
  providerId: ProviderId;
  category: ServiceCategory;
  description: string;
  formula: string;
}> {
  return (
    comparison?.providers.flatMap((provider) =>
      provider.lineItems.slice(0, 4).map((lineItem, index) => ({
        key: `${provider.providerId}-${lineItem.category}-${index}`,
        providerId: provider.providerId,
        category: lineItem.category,
        description: lineItem.description,
        formula:
          lineItem.baseHourlyCostUsd !== undefined
            ? `${formatCurrency(
                lineItem.baseHourlyCostUsd,
              )}/hr x ${HOURS_PER_MONTH} hrs/month = ${formatCurrency(
                lineItem.baseMonthlyCostUsd,
              )} monthly`
            : lineItem.unitPriceUsd !== undefined
              ? `${formatCurrency(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'} rolled into ${formatCurrency(
                  lineItem.baseMonthlyCostUsd,
                )} monthly`
              : `Provider adapter subtotal = ${formatCurrency(lineItem.baseMonthlyCostUsd)} monthly`,
      })),
    ) ?? []
  );
}

export function roleClassName(role: ExecutiveLens['role']): string {
  return role.toLowerCase().split(' ').join('-');
}

export function executiveRecommendation(
  analytics: ExecutiveAnalyticsModel,
  form: WorkloadFormState,
  regionCatalog: RegionCatalogResponse | null,
): { headline: string; detail: string } {
  const lowest = analytics.cheapest;

  if (!lowest) {
    return {
      headline: 'Run a comparison to create a recommendation',
      detail:
        'PolyCost will use current provider totals, service mappings, and workload assumptions to produce an export-ready executive brief.',
    };
  }

  const provider = providerLabel(lowest.providerId);
  const region = regionLabelForSummary(form.regionPreference, regionCatalog);
  const annualSavings = analytics.annualPotentialSavings;
  const savingsPhrase =
    annualSavings !== undefined && annualSavings > 0
      ? `can avoid up to ${formatCurrency(annualSavings)}/yr versus the highest current estimate`
      : 'is currently the lowest priced option, with providers tightly clustered';

  return {
    headline: `Shortlist ${provider} in ${region}`,
    detail: `${provider} ${savingsPhrase}. Validate service equivalence, regional availability, quotas, resilience, and data-transfer assumptions before target-cloud commitment.`,
  };
}

export function providerServiceLabel(providerId: ProviderId, category: ServiceCategory): string {
  if (category === 'support') {
    return 'Support plan';
  }

  if (category === 'licensing') {
    return 'OS licensing';
  }

  if (category === 'operations') {
    return 'Resilience ops';
  }

  if (providerId === 'aws') {
    switch (category) {
      case 'compute':
        return 'EC2';
      case 'storage':
        return 'EBS / S3';
      case 'database':
        return 'RDS';
      case 'network':
        return 'Data transfer';
    }
  }

  if (providerId === 'azure') {
    switch (category) {
      case 'compute':
        return 'VM';
      case 'storage':
        return 'Disk / Blob';
      case 'database':
        return 'Azure SQL';
      case 'network':
        return 'Bandwidth';
    }
  }

  switch (category) {
    case 'compute':
      return 'GCE';
    case 'storage':
      return 'PD / GCS';
    case 'database':
      return 'Cloud SQL';
    case 'network':
      return 'Egress';
  }
}

export function providerFitSummaries(
  summaries: ProviderCostSummary[],
  monthlyLowest?: ProviderCostSummary,
): ProviderFitSummary[] {
  return PROVIDER_ORDER.map((providerId) => {
    const summary = summaries.find((item) => item.providerId === providerId);

    if (!summary || summary.total === undefined) {
      return {
        providerId,
        label: 'Needs pricing',
        detail: 'Provider returned no priced estimate for this workload.',
        tone: 'unavailable',
      };
    }

    if (monthlyLowest?.providerId === providerId) {
      return {
        providerId,
        label: 'Cost leader',
        detail: 'Use as the baseline for business-case and procurement review.',
        tone: summary.approximateCount > 0 ? 'review' : 'preferred',
      };
    }

    return {
      providerId,
      label: summary.approximateCount > 0 ? 'Review fit' : 'Viable alternative',
      detail:
        summary.deltaFromLowest !== undefined
          ? `${formatSignedCurrency(summary.deltaFromLowest)} versus current low estimate.`
          : 'Compare service constraints before shortlisting.',
      tone: summary.approximateCount > 0 ? 'review' : 'preferred',
    };
  });
}

export function solutionArchitectureRisk({
  approximateCount,
  form,
  pricedProviderCount,
}: {
  approximateCount: number;
  form: WorkloadFormState;
  pricedProviderCount: number;
}): SolutionArchitectureReview['riskLevel'] {
  const egressGb = parseInputNumber(form.monthlyEgressGb);
  const peakUsers = parseInputNumber(form.peakConcurrentUsers);
  const resilienceGap = !form.multiAz && !form.multiRegion;
  const databaseGap = form.databaseEnabled && !form.databaseHighAvailability;
  const loadPathGap = Boolean(peakUsers && peakUsers >= 500 && !form.loadBalancer);

  if (pricedProviderCount <= 1 || databaseGap || loadPathGap) {
    return 'High';
  }

  if (
    pricedProviderCount < 3 ||
    approximateCount > 0 ||
    resilienceGap ||
    form.scalingType === 'fixed' ||
    Boolean(egressGb && egressGb >= 500 && !form.cdn)
  ) {
    return 'Medium';
  }

  return 'Low';
}

export function solutionArchitecturePosture(
  riskLevel: SolutionArchitectureReview['riskLevel'],
): SolutionArchitectureReview['posture'] {
  if (riskLevel === 'Low') {
    return 'Ready for shortlist';
  }

  if (riskLevel === 'Medium') {
    return 'Architecture review';
  }

  if (riskLevel === 'High') {
    return 'Assumptions needed';
  }

  return 'Pending';
}

export function decisionConfidence(
  pricedProviderCount: number,
  approximateCount: number,
): ExecutiveDecision['confidence'] {
  if (pricedProviderCount === 0) {
    return 'Pending';
  }

  if (pricedProviderCount === 3 && approximateCount === 0) {
    return 'High';
  }

  if (pricedProviderCount >= 2) {
    return 'Medium';
  }

  return 'Low';
}

export function confidenceDetail(
  confidence: ExecutiveDecision['confidence'],
  pricedProviderCount: number,
  approximateCount: number,
): string {
  if (confidence === 'Pending') {
    return 'No provider estimates yet';
  }

  if (confidence === 'High') {
    return 'Three providers priced with exact mappings';
  }

  if (confidence === 'Medium') {
    return `${pricedProviderCount}/3 providers priced; ${approximateCount} approximate mappings`;
  }

  return `${pricedProviderCount}/3 providers priced; validate before sharing`;
}

export function finOpsRecommendations({
  approximateCount,
  dominantCategory,
  lineItemCount,
  monthlyLowest,
  monthlySpread,
  monthlySpreadPercent,
}: {
  approximateCount: number;
  dominantCategory?: CategoryCostSummary;
  lineItemCount: number;
  monthlyLowest?: ProviderCostSummary;
  monthlySpread?: number;
  monthlySpreadPercent?: number;
}): string[] {
  if (lineItemCount === 0) {
    return [
      'Run a comparison to populate provider-specific cost drivers.',
      'Capture region, data transfer, database HA, and storage access assumptions before presenting.',
      'Use exports as the proposal artifact once provider prices are available.',
    ];
  }

  const recommendations = [
    monthlyLowest
      ? `Use ${providerLabel(monthlyLowest.providerId)} as the current on-demand baseline, then model commitments before final selection.`
      : 'Confirm provider availability before final selection.',
  ];

  if (monthlySpread !== undefined && monthlySpread > 0) {
    recommendations.push(
      `Validate the ${formatCurrency(monthlySpread)} monthly spread with provider calculators and regional SKU assumptions.`,
    );
  }

  if (monthlySpreadPercent !== undefined && monthlySpreadPercent >= 20) {
    recommendations.push(
      'Treat the spread as material for architecture governance and procurement negotiation.',
    );
  }

  if (dominantCategory) {
    recommendations.push(
      `${capitalize(dominantCategory.category)} is the leading driver; optimize sizing, utilization, and managed-service tier first.`,
    );
  }

  if (approximateCount > 0) {
    recommendations.push(
      `Review ${approximateCount} approximate line item${approximateCount === 1 ? '' : 's'} before using this as a client-facing estimate.`,
    );
  }

  recommendations.push(
    'For production decisions, add reserved/Savings Plan/CUD scenarios and expected data-growth sensitivity.',
  );

  return recommendations.slice(0, 5);
}

export function intervalOutlookRows(comparison: ComparisonResult | null): Array<{
  interval: IntervalKey;
  label: string;
  providers: Array<{ providerId: ProviderId; total?: number; percentOfMax: number }>;
}> {
  const providerResults = new Map<ProviderId, ComparisonProviderResult>(
    comparison?.providers.map((provider) => [provider.providerId, provider]) ?? [],
  );

  return INTERVALS.map(({ key, label }) => {
    const providers = PROVIDER_ORDER.map((providerId) => {
      const provider = providerResults.get(providerId);

      return {
        providerId,
        total: provider ? costForInterval(provider, key) : undefined,
      };
    });
    const maxTotal = Math.max(...providers.map((provider) => provider.total ?? 0), 0);

    return {
      interval: key,
      label,
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

export function compareButtonLabel(inputMode: InputMode): string {
  if (inputMode === 'describe') {
    return 'Parse requirements';
  }

  if (inputMode === 'diagram') {
    return 'Parse diagram';
  }

  return 'Compare';
}

export function compareLoadingLabel(inputMode: InputMode): string {
  if (inputMode === 'describe') {
    return 'Parsing requirements...';
  }

  if (inputMode === 'diagram') {
    return 'Parsing diagram...';
  }

  return 'Comparing...';
}

export function workspaceSessionStatus(expiresAt: string): {
  label: string;
  detail: string;
  tone: 'active' | 'soon' | 'expired';
} {
  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return {
      label: 'Session expiry pending',
      detail:
        'Server-side expiry is enforced. No silent refresh is used; sign in again if this session is rejected.',
      tone: 'active',
    };
  }

  const remainingMs = expiresAtMs - Date.now();
  const detail = `Expires ${formatDateTime(expiresAt)}. No silent refresh; expired or revoked sessions are cleared on the next check.`;

  if (remainingMs <= 0) {
    return {
      label: 'Session expired',
      detail,
      tone: 'expired',
    };
  }

  if (remainingMs <= 2 * 60 * 60 * 1000) {
    return {
      label: 'Session expires soon',
      detail,
      tone: 'soon',
    };
  }

  return {
    label: 'Session active',
    detail,
    tone: 'active',
  };
}

export function reconciliationEvidenceSummary(record: InvoiceReconciliationRecord): {
  readiness: string;
  sourceFingerprintPercent: number;
  skuMatchPercent: number;
  adjustmentCostUsd: number;
  adjustmentLineItemCount: number;
  commitmentLineItemCount: number;
  commitmentNetCostUsd: number;
  commitmentRowsRequiringProviderInventory: number;
  commitmentRowsRequiringAmortizationPeriod: number;
  commitmentRowsRequiringAllocationEvidence: number;
  invoiceGradeStatus: string;
  invoiceGradeMissingCount: number;
  invoiceGradePartialCount: number;
  invoiceGradeBlockers: string[];
  artifactId?: string;
  artifactRegisterStatus: string;
  artifactRegisteredCount: number;
  artifactVerifiedCount: number;
  artifactBlobStored: boolean;
  artifactBlobFileName?: string;
  artifactBlobSha256?: string;
  artifactBlobSizeBytes: number;
  artifactMalwareScanStatus: string;
  artifactRetentionUntil?: string;
  artifactLegalHold: boolean;
  artifactReviewStatus: InvoiceArtifactReviewStatus;
  artifactReviewReviewer?: string;
  artifactReviewRequestedAt?: string;
  artifactReviewedAt?: string;
  artifactReviewPendingCount: number;
  artifactReviewApprovedCount: number;
  artifactReviewRejectedCount: number;
  artifactPolicyExceptionStatus: InvoiceArtifactPolicyExceptionStatus;
  artifactPolicyExceptionReviewer?: string;
  artifactPolicyExceptionExpiresAt?: string;
  artifactPolicyExceptionReason?: string;
  artifactPolicyExceptionRequestedCount: number;
  artifactPolicyExceptionApprovedCount: number;
  artifactPolicyExceptionRejectedCount: number;
  artifactPolicyExceptionExpiredCount: number;
  artifactInvoiceControlValidationStatus: InvoiceControlValidationStatus;
  artifactInvoiceControlValidatedAt?: string;
  artifactInvoiceControlTotalDeltaUsd: number;
  artifactInvoiceControlImportDeltaUsd: number;
  artifactInvoiceControlPeriodMatched: boolean;
  artifactInvoiceControlMatchedCount: number;
  artifactInvoiceControlVarianceWarningCount: number;
  artifactInvoiceControlMismatchCount: number;
  artifactInvoiceControlNotRunCount: number;
  artifactKmsRequiredForProduction: boolean;
  artifactPrimaryCaveat: string;
  estimateComparableVarianceUsd: number;
  adjustmentCategories: string[];
  commitmentCategories: string[];
  primaryCaveat: string;
} {
  const evidence = record.evidence;
  const coverage = objectValue(evidence.invoiceCoverage);
  const matchSummary = objectValue(evidence.invoiceMatchSummary);
  const adjustmentSummary = objectValue(evidence.invoiceAdjustmentSummary);
  const commitmentEvidence = objectValue(adjustmentSummary.commitmentEvidence);
  const invoiceGradeReadiness = objectValue(evidence.invoiceGradeReadiness);
  const artifactRegister = objectValue(evidence.invoiceGradeArtifactRegister);
  const caveats = stringArrayValue(matchSummary.caveats);
  const artifactCaveats = stringArrayValue(artifactRegister.caveats);
  const artifactRecords = arrayValue(artifactRegister.artifacts).map((artifact) =>
    objectValue(artifact),
  );
  const primaryArtifact = artifactRecords.find((artifact) => stringValue(artifact.id));
  const artifactId = primaryArtifact ? stringValue(primaryArtifact.id) : undefined;
  const storedBlob = objectValue(primaryArtifact?.storedBlob);
  const artifactBlobFileName = stringValue(storedBlob.fileName);
  const artifactBlobSha256 = stringValue(storedBlob.contentSha256);
  const artifactBlobSizeBytes = numberValue(storedBlob.contentSizeBytes);
  const governance = objectValue(storedBlob.governance);
  const storageProfile = objectValue(governance.storageProfile);
  const retentionPolicy = objectValue(governance.retentionPolicy);
  const malwareScan = objectValue(governance.malwareScan);
  const readiness =
    stringValue(matchSummary.readiness) ??
    (record.status === 'matched' ? 'reconciled-evidence-ready' : 'reconciliation-foundation');
  const categorySummaries = arrayValue(adjustmentSummary.categories)
    .map((categorySummary) => objectValue(categorySummary))
    .map((categorySummary) => ({
      category: stringValue(categorySummary.category) ?? 'adjustment',
      totalCostUsd: numberValue(categorySummary.totalCostUsd),
    }));
  const adjustmentCategories = categorySummaries
    .filter(({ category }) => category !== 'usage' && !category.startsWith('commitment-'))
    .map(({ category, totalCostUsd }) => `${category} ${formatCurrency(totalCostUsd)}`);
  const commitmentCategories = categorySummaries
    .filter(({ category }) => category.startsWith('commitment-'))
    .map((categorySummary) => {
      const categoryLabel = categorySummary.category.replace(/^commitment-/, '');

      return `${categoryLabel} ${formatCurrency(categorySummary.totalCostUsd)}`;
    });

  return {
    readiness: readiness.replace(/-/g, ' '),
    sourceFingerprintPercent: numberValue(coverage.sourceFingerprintPercent),
    skuMatchPercent: numberValue(coverage.skuMatchPercent),
    adjustmentCostUsd: numberValue(adjustmentSummary.adjustmentCostUsd),
    adjustmentLineItemCount: numberValue(adjustmentSummary.adjustmentLineItemCount),
    commitmentLineItemCount: numberValue(adjustmentSummary.commitmentLineItemCount),
    commitmentNetCostUsd: numberValue(adjustmentSummary.commitmentNetCostUsd),
    commitmentRowsRequiringProviderInventory: numberValue(
      commitmentEvidence.rowsRequiringProviderInventory,
    ),
    commitmentRowsRequiringAmortizationPeriod: numberValue(
      commitmentEvidence.rowsRequiringAmortizationPeriod,
    ),
    commitmentRowsRequiringAllocationEvidence: numberValue(
      commitmentEvidence.rowsRequiringAllocationEvidence,
    ),
    invoiceGradeStatus: (
      stringValue(invoiceGradeReadiness.status) ?? 'invoice-grade-blocked'
    ).replace(/-/g, ' '),
    invoiceGradeMissingCount: numberValue(invoiceGradeReadiness.missingCount),
    invoiceGradePartialCount: numberValue(invoiceGradeReadiness.partialCount),
    invoiceGradeBlockers: stringArrayValue(invoiceGradeReadiness.blockers).slice(0, 3),
    ...(artifactId ? { artifactId } : {}),
    artifactRegisterStatus: (
      stringValue(artifactRegister.status) ?? 'no-artifacts-registered'
    ).replace(/-/g, ' '),
    artifactRegisteredCount: numberValue(artifactRegister.registeredCount),
    artifactVerifiedCount: numberValue(artifactRegister.verifiedCount),
    artifactBlobStored: stringValue(storedBlob.storageStatus) === 'stored',
    ...(artifactBlobFileName ? { artifactBlobFileName } : {}),
    ...(artifactBlobSha256 ? { artifactBlobSha256 } : {}),
    artifactBlobSizeBytes,
    artifactMalwareScanStatus: stringValue(malwareScan.status) ?? 'pending',
    ...(stringValue(retentionPolicy.retentionUntil)
      ? { artifactRetentionUntil: stringValue(retentionPolicy.retentionUntil) }
      : {}),
    artifactLegalHold: booleanValue(retentionPolicy.legalHold),
    artifactReviewStatus: invoiceArtifactReviewStatus(primaryArtifact?.reviewStatus),
    ...(stringValue(primaryArtifact?.reviewReviewer)
      ? { artifactReviewReviewer: stringValue(primaryArtifact?.reviewReviewer) }
      : {}),
    ...(stringValue(primaryArtifact?.reviewRequestedAt)
      ? { artifactReviewRequestedAt: stringValue(primaryArtifact?.reviewRequestedAt) }
      : {}),
    ...(stringValue(primaryArtifact?.reviewedAt)
      ? { artifactReviewedAt: stringValue(primaryArtifact?.reviewedAt) }
      : {}),
    artifactReviewPendingCount: numberValue(artifactRegister.reviewPendingCount),
    artifactReviewApprovedCount: numberValue(artifactRegister.reviewApprovedCount),
    artifactReviewRejectedCount: numberValue(artifactRegister.reviewRejectedCount),
    artifactPolicyExceptionStatus: invoiceArtifactPolicyExceptionStatus(
      primaryArtifact?.policyExceptionStatus,
      stringValue(primaryArtifact?.policyExceptionExpiresAt),
    ),
    ...(stringValue(primaryArtifact?.policyExceptionReviewer)
      ? { artifactPolicyExceptionReviewer: stringValue(primaryArtifact?.policyExceptionReviewer) }
      : {}),
    ...(stringValue(primaryArtifact?.policyExceptionExpiresAt)
      ? { artifactPolicyExceptionExpiresAt: stringValue(primaryArtifact?.policyExceptionExpiresAt) }
      : {}),
    ...(stringValue(primaryArtifact?.policyExceptionReason)
      ? { artifactPolicyExceptionReason: stringValue(primaryArtifact?.policyExceptionReason) }
      : {}),
    artifactPolicyExceptionRequestedCount: numberValue(
      artifactRegister.policyExceptionRequestedCount,
    ),
    artifactPolicyExceptionApprovedCount: numberValue(
      artifactRegister.policyExceptionApprovedCount,
    ),
    artifactPolicyExceptionRejectedCount: numberValue(
      artifactRegister.policyExceptionRejectedCount,
    ),
    artifactPolicyExceptionExpiredCount: numberValue(artifactRegister.policyExceptionExpiredCount),
    artifactInvoiceControlValidationStatus: invoiceControlValidationStatus(
      primaryArtifact?.invoiceControlValidationStatus,
    ),
    ...(stringValue(primaryArtifact?.invoiceControlValidatedAt)
      ? {
          artifactInvoiceControlValidatedAt: stringValue(
            primaryArtifact?.invoiceControlValidatedAt,
          ),
        }
      : {}),
    artifactInvoiceControlTotalDeltaUsd: numberValue(primaryArtifact?.invoiceControlTotalDeltaUsd),
    artifactInvoiceControlImportDeltaUsd: numberValue(
      primaryArtifact?.invoiceControlImportDeltaUsd,
    ),
    artifactInvoiceControlPeriodMatched: booleanValue(primaryArtifact?.invoiceControlPeriodMatched),
    artifactInvoiceControlMatchedCount: numberValue(artifactRegister.invoiceControlMatchedCount),
    artifactInvoiceControlVarianceWarningCount: numberValue(
      artifactRegister.invoiceControlVarianceWarningCount,
    ),
    artifactInvoiceControlMismatchCount: numberValue(artifactRegister.invoiceControlMismatchCount),
    artifactInvoiceControlNotRunCount: numberValue(artifactRegister.invoiceControlNotRunCount),
    artifactKmsRequiredForProduction: booleanValue(storageProfile.kmsKeyRequiredForProduction),
    artifactPrimaryCaveat:
      artifactCaveats[0] ??
      'No invoice artifact metadata has been registered for this reconciliation yet.',
    estimateComparableVarianceUsd: numberValue(
      adjustmentSummary.estimateComparableVarianceUsd ?? record.varianceUsd,
    ),
    adjustmentCategories,
    commitmentCategories,
    primaryCaveat:
      caveats[0] ??
      'Estimate-vs-actual evidence is available, but invoice-grade billing remains a separate provider-led control.',
  };
}

export function comparisonHistorySummary(form: WorkloadFormState): string {
  const name = form.workloadName.trim();
  const workload = workloadTypeLabel(form.workloadType);
  const service = serviceFamilyShortLabel(form.selectedServiceFamilyId);

  return name ? `${name} · ${workload}` : `${workload} · ${service}`;
}

export function manualAssumptionsForService(
  serviceCategory: ServiceRequirementCategory,
  serviceType: string,
): string[] {
  if (serviceCategory === 'compute' || serviceCategory === 'containers') {
    return ['manual classification', '2 vCPU', '8 GB memory'];
  }

  if (serviceCategory === 'storage') {
    return ['manual classification', '100 GB storage'];
  }

  if (serviceCategory === 'database') {
    return ['manual classification', '100 GB database storage'];
  }

  if (serviceType === 'load-balancer') {
    return ['manual classification', `${HOURS_PER_MONTH} load-balancer hours per month`];
  }

  if (serviceType === 'cdn') {
    return ['manual classification', 'CDN enabled with 85% cache hit ratio'];
  }

  return ['manual classification'];
}
