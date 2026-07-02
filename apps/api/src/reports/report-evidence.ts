import { PricingModelCost } from '../adapters/common/cloud-provider-adapter';
import {
  ComparisonLineItem,
  ComparisonProviderResult,
  ComparisonResult,
} from '../comparison/comparison.types';
import { commitmentPricingModelCandidates } from '../comparison/commitment-policy';
import { HOURS_PER_DAY, HOURS_PER_MONTH, HOURS_PER_WEEK } from '../cost-time';
import { ServiceRequirement } from '../nws/nws.types';
import {
  providerRegionForCanonicalRegion,
  supportedCanonicalRegions,
} from '../pricing-normalization/region-map';
import { ReportInterval, ReportOptions, ReportPricingModel } from './report.types';

const REPORT_PRICING_MODELS: ReportPricingModel[] = [
  'on-demand',
  'reserved-1yr',
  'reserved-3yr',
  'savings-plan',
  'spot',
];

const REGION_VARIANCE_PROFILES = supportedCanonicalRegions().map((region) => ({
  region,
  multiplier: regionVarianceMultiplier(region),
  evidence: regionVarianceEvidence(region),
}));

export interface RegionComparisonEvidenceRow {
  providerId: string;
  comparisonRegion: string;
  providerRegion: string;
  modeledMonthlyUsd: number;
  deltaVsSelectedMonthlyUsd: number;
  multiplier: number;
  evidence: string;
}

interface ProviderScenario {
  providerId: string;
  available: boolean;
  intervalCostUsd?: number;
  monthlyCostUsd?: number;
  yearlyCostUsd?: number;
  caveat: string;
  approximateLineItemCount: number;
}

interface RankedProviderScenario extends ProviderScenario {
  rank?: number;
  deltaVsLowestMonthlyUsd?: number;
  annualAvoidableSpendUsd?: number;
}

interface AppPlatformModelRates {
  requestPerMillion: number;
  vcpuHour: number;
  memoryGbHour: number;
  alwaysOnVcpuHour: number;
  alwaysOnMemoryGbHour: number;
}

interface ServerlessFunctionRates {
  requestPerMillion: number;
  gbSecond: number;
}

interface ComputeSpecEvidenceProfile {
  x86Family: string;
  armFamily: string;
  gpuFamily?: string;
  useCase: string;
  networkBaseline: string;
  diskBaseline: string;
}

type ComputeSpecTier =
  | 'small'
  | 'burstable'
  | 'balanced'
  | 'compute'
  | 'memory'
  | 'storage'
  | 'accelerated'
  | 'custom';

interface CostCoverageDimension {
  key: string;
  label: string;
  requirementCategories: string[];
  reviewCue: string;
  matches(lineItem: ComparisonLineItem): boolean;
  configured?(result: ComparisonResult): boolean;
}

const APP_PLATFORM_MODEL_RATES: Record<
  ComparisonProviderResult['providerId'],
  AppPlatformModelRates
> = {
  aws: {
    requestPerMillion: 0,
    vcpuHour: 0.064,
    memoryGbHour: 0.007,
    alwaysOnVcpuHour: 0.064,
    alwaysOnMemoryGbHour: 0.007,
  },
  azure: {
    requestPerMillion: 0.4,
    vcpuHour: 0.0864,
    memoryGbHour: 0.009,
    alwaysOnVcpuHour: 0.095,
    alwaysOnMemoryGbHour: 0.012,
  },
  gcp: {
    requestPerMillion: 0.4,
    vcpuHour: 0.0864,
    memoryGbHour: 0.009,
    alwaysOnVcpuHour: 0.0648,
    alwaysOnMemoryGbHour: 0.00675,
  },
};

const SERVERLESS_FUNCTION_RATES: Record<
  ComparisonProviderResult['providerId'],
  ServerlessFunctionRates
> = {
  aws: {
    requestPerMillion: 0.2,
    gbSecond: 0.0000166667,
  },
  azure: {
    requestPerMillion: 0.2,
    gbSecond: 0.000016,
  },
  gcp: {
    requestPerMillion: 0.4,
    gbSecond: 0.0000025,
  },
};

const COMPUTE_ARM_COST_FACTORS: Record<ComparisonProviderResult['providerId'], number> = {
  aws: 0.8,
  azure: 0.85,
  gcp: 0.82,
};

const COMPUTE_SPEC_EVIDENCE: Record<
  ComputeSpecTier,
  Record<ComparisonProviderResult['providerId'], ComputeSpecEvidenceProfile>
> = {
  small: {
    aws: {
      x86Family: 'T3',
      armFamily: 'T4g',
      useCase: 'burstable/shared-core compute',
      networkBaseline: 'low-to-moderate burst network with CPU-credit caveat',
      diskBaseline: 'gp3/EBS baseline IOPS must be validated',
    },
    azure: {
      x86Family: 'Bsv2',
      armFamily: 'Bpsv2',
      useCase: 'burstable/shared-core compute',
      networkBaseline: 'variable burst network with CPU-credit caveat',
      diskBaseline: 'Managed Disk baseline depends on chosen VM size',
    },
    gcp: {
      x86Family: 'E2 shared-core',
      armFamily: 'Tau T2A',
      useCase: 'shared-core small compute',
      networkBaseline: 'shared-core network profile; validate sustained CPU',
      diskBaseline: 'Persistent Disk baseline depends on disk type and size',
    },
  },
  burstable: {
    aws: {
      x86Family: 'T3',
      armFamily: 'T4g',
      useCase: 'burstable/shared-core compute',
      networkBaseline: 'low-to-moderate burst network with CPU-credit caveat',
      diskBaseline: 'gp3/EBS baseline IOPS must be validated',
    },
    azure: {
      x86Family: 'Bsv2',
      armFamily: 'Bpsv2',
      useCase: 'burstable/shared-core compute',
      networkBaseline: 'variable burst network with CPU-credit caveat',
      diskBaseline: 'Managed Disk baseline depends on chosen VM size',
    },
    gcp: {
      x86Family: 'E2 shared-core',
      armFamily: 'Tau T2A',
      useCase: 'shared-core small compute',
      networkBaseline: 'shared-core network profile; validate sustained CPU',
      diskBaseline: 'Persistent Disk baseline depends on disk type and size',
    },
  },
  balanced: {
    aws: {
      x86Family: 'M7i/M6i',
      armFamily: 'M7g Graviton3',
      useCase: 'general-purpose production compute',
      networkBaseline: 'moderate-to-high ENA bandwidth by size',
      diskBaseline: 'EBS gp3/io2 baseline should be checked with the final SKU',
    },
    azure: {
      x86Family: 'Dv5/Dsv5',
      armFamily: 'Dpsv5 Ampere Altra',
      useCase: 'balanced application and middleware compute',
      networkBaseline: 'Accelerated Networking bandwidth scales by VM size',
      diskBaseline: 'Premium/Standard SSD baseline should be checked with the final SKU',
    },
    gcp: {
      x86Family: 'N2/N2D',
      armFamily: 'Tau T2A',
      useCase: 'general-purpose portable compute',
      networkBaseline: 'machine-size network bandwidth tiers apply',
      diskBaseline: 'Balanced PD/Hyperdisk baseline should be checked with the final SKU',
    },
  },
  compute: {
    aws: {
      x86Family: 'C7i/C6i',
      armFamily: 'C7g Graviton3',
      useCase: 'CPU-intensive web, batch, and encoding compute',
      networkBaseline: 'higher packet/network profile than general purpose at similar sizes',
      diskBaseline: 'EBS throughput should be validated for batch and scratch workloads',
    },
    azure: {
      x86Family: 'Fsv2',
      armFamily: 'Dpsv5 Ampere Altra',
      useCase: 'CPU-heavy APIs and batch workers',
      networkBaseline: 'high CPU-to-memory ratio; NIC bandwidth varies by size',
      diskBaseline: 'Premium SSD/Ultra Disk may be needed for scratch throughput',
    },
    gcp: {
      x86Family: 'C3/C2',
      armFamily: 'Tau T2A',
      useCase: 'CPU-bound services and batch processing',
      networkBaseline: 'high-performance networking on larger compute shapes',
      diskBaseline: 'Hyperdisk/Balanced PD should be selected if I/O gates CPU',
    },
  },
  memory: {
    aws: {
      x86Family: 'R7i/X2idn',
      armFamily: 'R7g Graviton3',
      useCase: 'database, cache, and memory-heavy compute',
      networkBaseline: 'high bandwidth options on larger memory sizes',
      diskBaseline: 'EBS-optimized throughput and IOPS must be validated for databases',
    },
    azure: {
      x86Family: 'Esv5/Mv2',
      armFamily: 'Epsv5 Ampere Altra',
      useCase: 'SQL, SAP, cache, and memory-heavy compute',
      networkBaseline: 'bandwidth scales materially by VM size',
      diskBaseline: 'Premium SSD v2 or Ultra Disk may be needed for database I/O',
    },
    gcp: {
      x86Family: 'M3/M2',
      armFamily: 'Tau T2A',
      useCase: 'large memory stores and database engines',
      networkBaseline: 'high-memory network profile varies by size',
      diskBaseline: 'Hyperdisk/SSD PD should be modeled for sustained database I/O',
    },
  },
  storage: {
    aws: {
      x86Family: 'I4i/D3',
      armFamily: 'I4g',
      useCase: 'high I/O storage-optimized compute',
      networkBaseline: 'high network/EBS bandwidth on local-storage families',
      diskBaseline: 'local NVMe or dense HDD profile; validate durability and replication',
    },
    azure: {
      x86Family: 'Lsv3',
      armFamily: 'Lasv3',
      useCase: 'high-throughput local-disk compute',
      networkBaseline: 'storage-optimized networking varies by L-series size',
      diskBaseline: 'local NVMe plus managed-disk persistence requirements',
    },
    gcp: {
      x86Family: 'Z3',
      armFamily: 'Tau T2A',
      useCase: 'storage-optimized analytics and scratch-heavy compute',
      networkBaseline: 'high-throughput machine profile; size determines bandwidth',
      diskBaseline: 'local SSD/Hyperdisk tradeoffs must be modeled explicitly',
    },
  },
  accelerated: {
    aws: {
      x86Family: 'G5/P4d',
      armFamily: 'G5g',
      gpuFamily: 'G5/P4d',
      useCase: 'CUDA, ML, graphics, and accelerator compute',
      networkBaseline: 'validate GPU interconnect, EFA, and data-ingest bandwidth',
      diskBaseline: 'local NVMe/EBS throughput can dominate dataset staging',
    },
    azure: {
      x86Family: 'NCv3/NC A100',
      armFamily: 'NC A100',
      gpuFamily: 'NCv3/NC A100',
      useCase: 'CUDA, ML, HPC, and visualization compute',
      networkBaseline: 'validate InfiniBand/RDMA support when training scales',
      diskBaseline: 'Premium SSD/Ultra Disk often required for data staging',
    },
    gcp: {
      x86Family: 'A2/G2',
      armFamily: 'G2',
      gpuFamily: 'A2/G2',
      useCase: 'ML training/inference and accelerator-heavy compute',
      networkBaseline: 'validate GPU count, local SSD, and network tier for training',
      diskBaseline: 'local SSD/Hyperdisk staging can dominate effective throughput',
    },
  },
  custom: {
    aws: {
      x86Family: 'custom-sized EC2 family',
      armFamily: 'custom Graviton target',
      useCase: 'custom CPU/memory compute',
      networkBaseline: 'bandwidth depends on nearest selected EC2 size',
      diskBaseline: 'EBS baseline depends on volume type and attached instance size',
    },
    azure: {
      x86Family: 'custom-sized VM family',
      armFamily: 'custom Ampere target',
      useCase: 'custom CPU/memory compute',
      networkBaseline: 'bandwidth depends on chosen VM size and NIC limits',
      diskBaseline: 'Managed Disk IOPS/throughput depends on disk tier and VM size',
    },
    gcp: {
      x86Family: 'custom machine type',
      armFamily: 'custom Tau target',
      useCase: 'custom CPU/memory compute',
      networkBaseline: 'network bandwidth scales with vCPU count and machine family',
      diskBaseline: 'Persistent Disk/Hyperdisk performance must be sized separately',
    },
  },
};

const COST_COVERAGE_DIMENSIONS: CostCoverageDimension[] = [
  {
    key: 'compute',
    label: 'Compute families and sizing',
    requirementCategories: ['compute'],
    reviewCue: 'Validate family, architecture, vCPU/RAM, tenancy, bandwidth, disk baseline, and commitment eligibility.',
    matches: (lineItem) => lineItem.category === 'compute' || lineItem.costComponent === 'compute',
  },
  {
    key: 'storage',
    label: 'Storage classes, snapshots, and retrieval',
    requirementCategories: ['storage'],
    reviewCue:
      'Validate storage class, operations, retrieval, replication, minimum-duration exposure, snapshot retention, IOPS, multi-attach, and lifecycle policies.',
    matches: (lineItem) =>
      lineItem.category === 'storage' ||
      /storage|snapshot|retrieval|replication|lifecycle|archive|backup|minimum-duration|multi-attach/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'networking',
    label: 'Networking, egress, CDN, NAT, DNS, and private connectivity',
    requirementCategories: ['networking', 'edge'],
    reviewCue: 'Validate tiered internet egress, CDN hit ratio, NAT path, DNS volume, inter-region, cross-AZ, VPN, and private circuit assumptions.',
    matches: (lineItem) =>
      lineItem.category === 'network' ||
      lineItem.costComponent === 'egress' ||
      /egress|cdn|nat|dns|vpn|direct connect|expressroute|interconnect|load balancer|private/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'database',
    label: 'Database, NoSQL, cache, warehouse, and search',
    requirementCategories: ['database', 'analytics'],
    reviewCue: 'Validate engine tier, storage growth, backup retention, IOPS, replicas, RU/s, cache, warehouse query, and search capacity.',
    matches: (lineItem) =>
      lineItem.category === 'database' ||
      lineItem.costComponent === 'database' ||
      /database|rds|sql|nosql|ru\/s|cosmos|dynamodb|cache|redis|warehouse|redshift|synapse|bigquery|search|opensearch/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'runtime',
    label: 'Serverless, containers, registry, and app platforms',
    requirementCategories: ['containers', 'application', 'integration'],
    reviewCue: 'Validate invocation duration, memory curve, control-plane overhead, node cost, registry storage/transfer, and request-vs-always-on fit.',
    matches: (lineItem) =>
      /lambda|function|serverless|container|kubernetes|eks|aks|gke|registry|artifact|app runner|app service|cloud run|api gateway|queue|event/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'ai-ml',
    label: 'AI/ML training, inference, vectors, and generative AI',
    requirementCategories: ['ai'],
    reviewCue:
      'Validate GPU hours, hosted model hours, inference requests, vector storage/query volume, token volume, model region, and provider model availability.',
    matches: (lineItem) =>
      /ai\/ml|machine learning|model hosting|gpu-hour|ai inference|vector|generative ai|input token|output token/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'operations',
    label: 'Monitoring, observability, secrets, WAF, and security operations',
    requirementCategories: ['operations', 'security', 'devops'],
    reviewCue: 'Validate logs, metrics, traces, alarms, dashboards, secrets, WAF, DDoS, posture-management, and retention assumptions.',
    matches: (lineItem) =>
      lineItem.category === 'operations' ||
      lineItem.costComponent === 'operations' ||
      /monitor|observability|log|metric|trace|alarm|dashboard|secret|key vault|waf|ddos|defender|guardduty|security/i.test(
        lineItem.description,
      ),
  },
  {
    key: 'support-licensing',
    label: 'Support plans and OS/licensing',
    requirementCategories: [],
    reviewCue: 'Validate selected support tier, Windows/BYOL eligibility, Hybrid Benefit, sole-tenant or licensing constraints, and support minimums.',
    matches: (lineItem) =>
      lineItem.category === 'support' ||
      lineItem.category === 'licensing' ||
      lineItem.costComponent === 'support' ||
      lineItem.costComponent === 'licensing' ||
      /support|license|windows|byol|hybrid benefit/i.test(lineItem.description),
    configured: (result) => {
      const profile = result.requirements?.workloadProfile;
      return Boolean(
        profile?.supportTier ||
          (profile?.operatingSystem && profile.operatingSystem !== 'linux'),
      );
    },
  },
  {
    key: 'pricing-models',
    label: 'Pricing models, commitments, and spot estimates',
    requirementCategories: [],
    reviewCue: 'Validate on-demand, reserved, Savings Plan/CUD, spot estimate, upfront option, term length, and commitment coverage assumptions.',
    matches: (lineItem) =>
      Boolean(
        lineItem.pricingModels?.some(
          (model) => model.model !== 'on-demand' && (model.available || model.estimated),
        ),
      ),
    configured: (result) =>
      result.providers.some((provider) =>
        provider.pricingModels?.some(
          (model) => model.model !== 'on-demand' && (model.available || model.estimated),
        ),
      ) ||
      (result.requirements?.workloadProfile?.commitmentPreferencePercent ?? 0) > 0,
  },
];

export function reportCoverRows(result: ComparisonResult, options: ReportOptions): string[][] {
  const pricedProviders = result.providers.filter((provider) => provider.totals.monthly > 0).length;
  const lineItemCount = result.providers.reduce(
    (count, provider) => count + provider.lineItems.length,
    0,
  );
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );

  return [
    ['Field', 'Value'],
    ['Report title', 'PolyCost Comparison Report'],
    ['Comparison ID', result.comparisonId],
    ['Generated at', options.generatedAt ?? result.pricingAsOf],
    ['Pricing data as of', result.pricingAsOf],
    ['Data freshness notice', dataFreshnessNotice(result, options)],
    ['Data health status', dataHealthStatusSummary(options)],
    ['Provider coverage', `${pricedProviders}/${result.providers.length} providers priced`],
    ['Line-item evidence', `${lineItemCount} line item(s), ${approximateLineItems} approximate`],
  ];
}

export function reportContextRows(options: ReportOptions): string[][] {
  return [
    ['Selected interval', labelForInterval(options.interval ?? 'monthly')],
    ['Selected pricing model', labelForPricingModel(options.pricingModel ?? 'on-demand')],
  ];
}

export function dataFreshnessRows(options: ReportOptions): string[][] {
  const health = options.dataHealth;

  if (!health) {
    return [
      ['Metric', 'Value'],
      [
        'Data health status',
        'Not supplied to report generator; use the Pricing data as of timestamp and refresh before commitment.',
      ],
    ];
  }

  const catalogRows = health.providers.reduce(
    (total, provider) => total + provider.cache.catalogRows,
    0,
  );
  const currentRateRows = health.providers.reduce(
    (total, provider) => total + provider.cache.currentRateRows,
    0,
  );
  const syncCounts = health.providers.reduce(
    (totals, provider) => ({
      success: totals.success + provider.cache.syncStatusCounts.success,
      partial: totals.partial + provider.cache.syncStatusCounts.partial,
      failed: totals.failed + provider.cache.syncStatusCounts.failed,
    }),
    { success: 0, partial: 0, failed: 0 },
  );

  return [
    ['Metric', 'Value'],
    ['Overall status', health.overallStatus],
    ['Alert count', String(health.alertCount)],
    ['Freshness policy', `${health.freshnessPolicyHours} hours`],
    ['Health generated at', health.generatedAt],
    ['Provider freshness', providerFreshnessSummary(health)],
    ['Catalog rows', String(catalogRows)],
    ['Current rate rows', String(currentRateRows)],
    [
      'Sync status counts',
      `success ${syncCounts.success}; partial ${syncCounts.partial}; failed ${syncCounts.failed}`,
    ],
  ];
}

function dataFreshnessNotice(result: ComparisonResult, options: ReportOptions): string {
  const health = options.dataHealth;

  if (!health) {
    return `Pricing data as of ${result.pricingAsOf}; refresh cached pricing before final commitment.`;
  }

  if (health.overallStatus === 'fresh') {
    return `Pricing data health was fresh at ${health.generatedAt}; source comparison pricing data as of ${result.pricingAsOf}.`;
  }

  return `${health.alertCount} data-health alert(s) at ${health.generatedAt}; refresh cached pricing before final commitment.`;
}

function dataHealthStatusSummary(options: ReportOptions): string {
  const health = options.dataHealth;

  if (!health) {
    return 'Not supplied with this export.';
  }

  return `${health.overallStatus}; policy ${health.freshnessPolicyHours}h; ${providerFreshnessSummary(
    health,
  )}`;
}

function providerFreshnessSummary(health: NonNullable<ReportOptions['dataHealth']>): string {
  return health.providers
    .map((provider) => {
      const age =
        provider.ageHours !== undefined ? `${provider.ageHours}h` : provider.freshness;
      return `${provider.providerId} ${provider.freshness} (${age}, ${provider.cache.currentRateRows} current rates)`;
    })
    .join('; ');
}

export function architectureOverviewRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements?.serviceRequirements ?? [];
  const rows =
    requirements.length > 0
      ? requirements.map((requirement) => architectureOverviewRow(result, requirement))
      : fallbackArchitectureOverviewRows(result);

  return [
    [
      'Category',
      'User requirement',
      'AWS mapping',
      'Azure mapping',
      'GCP mapping',
      'Equivalence confidence',
      'Review cue',
    ],
    ...(rows.length > 0
      ? rows
      : [
          [
            'No architecture services',
            'No normalized requirements or provider line items were attached.',
            '',
            '',
            '',
            'Missing',
            'Run a comparison with normalized workload requirements before proposal review.',
          ],
        ]),
  ];
}

export function workloadScopeRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements;

  if (!requirements) {
    return [
      ['Field', 'Value'],
      ['Workload scope', 'No normalized workload summary was attached to this comparison.'],
    ];
  }

  const workloadProfile = requirements.workloadProfile;
  const availability = requirements.availability;
  const dataResidency = workloadProfile?.dataResidency;
  const usagePattern = workloadProfile?.usagePattern;
  const costAllocationTags =
    workloadProfile?.tags?.map((tag) => `${tag.key}:${tag.value}`).join(', ') ?? 'None supplied';

  return [
    ['Field', 'Value'],
    ['Workload name', requirements.workloadName ?? 'Unnamed workload'],
    ['Workload type', requirements.workloadType],
    ['Input source', requirements.sourceType],
    ['Region preference', requirements.regionPreference ?? 'Not specified'],
    ['Availability posture', availabilitySummary(availability)],
    ['Fault tolerance', availability?.faultTolerance ?? 'Not specified'],
    ['Environment', workloadProfile?.environment ?? 'Not specified'],
    ['Operating system / license', workloadProfile?.operatingSystem ?? 'Not specified'],
    ['Support tier', workloadProfile?.supportTier ?? 'Not specified'],
    [
      'Commitment preference',
      workloadProfile?.commitmentPreferencePercent !== undefined
        ? `${workloadProfile.commitmentPreferencePercent}%`
        : 'Not specified',
    ],
    [
      'Usage pattern',
      usagePattern
        ? usagePattern.type === 'bursty'
          ? `bursty (${usagePattern.averageUtilizationPercent ?? 'unknown'}% average utilization)`
          : usagePattern.type === 'scheduled'
            ? `scheduled (${usagePattern.hoursPerDay ?? '?'} hrs/day, ${usagePattern.daysPerWeek ?? '?'} days/week)`
            : 'always on'
        : 'Not specified',
    ],
    [
      'Data residency',
      dataResidency
        ? `${dataResidency.scope}${dataResidency.complianceLocked ? ' (locked)' : ''}`
        : 'Not specified',
    ],
    ['Cost allocation tags', costAllocationTags],
    ['Normalized service requirements', requirements.serviceRequirements.length.toString()],
  ];
}

function availabilitySummary(
  availability: NonNullable<ComparisonResult['requirements']>['availability'],
): string {
  if (!availability) {
    return 'Not specified';
  }

  if (availability.multiRegion) {
    return availability.slaTarget
      ? `multi-region (${availability.slaTarget} SLA target)`
      : 'multi-region';
  }

  if (availability.multiAz) {
    return availability.slaTarget ? `multi-AZ (${availability.slaTarget} SLA target)` : 'multi-AZ';
  }

  return availability.slaTarget ? `single-zone (${availability.slaTarget} SLA target)` : 'single-zone';
}

export function decisionSummaryRows(
  result: ComparisonResult,
  options: ReportOptions,
): string[][] {
  const interval = options.interval ?? 'monthly';
  const pricingModel = options.pricingModel ?? 'on-demand';
  const rankedScenarios = rankedProviderScenarios(result, options);
  const best = rankedScenarios.find((scenario) => scenario.rank === 1);
  const eligible = rankedScenarios.filter((scenario) => scenario.rank !== undefined);
  const highest = eligible.at(-1);
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );
  const warningCount = result.warnings?.length ?? 0;

  return [
    ['Signal', 'Detail'],
    [
      'Cost baseline',
      best
        ? `${best.providerId} ranks #1 for ${labelForPricingModel(pricingModel)} at $${formatNumber(
            best.intervalCostUsd ?? 0,
          )} ${labelForInterval(interval).toLowerCase()} / $${formatNumber(
            best.monthlyCostUsd ?? 0,
          )} monthly.`
        : `No provider is eligible for the selected ${labelForPricingModel(pricingModel)} scenario.`,
    ],
    ['Selected scenario', `${labelForPricingModel(pricingModel)} viewed at ${labelForInterval(interval)} cadence.`],
    [
      'Savings spread',
      best && highest && highest.providerId !== best.providerId
        ? `$${formatNumber(
            (highest.monthlyCostUsd ?? 0) - (best.monthlyCostUsd ?? 0),
          )} monthly / $${formatNumber(
            (highest.yearlyCostUsd ?? 0) - (best.yearlyCostUsd ?? 0),
          )} annual separates the highest and lowest eligible provider.`
        : 'Not enough eligible providers to calculate a provider-to-provider spread.',
    ],
    ['Evidence confidence', evidenceConfidence(result.providers.length, approximateLineItems, warningCount)],
    [
      'Architecture validation',
      best
        ? `${best.providerId} still needs regional SKU, quota, resilience, data-transfer path, and service-equivalence validation before target-cloud commitment.`
        : 'Validate pricing model availability before this scenario is used for target-cloud commitment.',
    ],
  ];
}

export function providerRankingRows(
  result: ComparisonResult,
  options: ReportOptions,
): string[][] {
  const interval = options.interval ?? 'monthly';

  return [
    [
      'Provider',
      'Rank',
      'Selected model eligible',
      `${labelForInterval(interval)} USD`,
      'Monthly USD',
      'Yearly USD',
      'Delta vs lowest monthly USD',
      'Annual avoidable spend USD',
      'Approximate line items',
      'Evidence note',
    ],
    ...rankedProviderScenarios(result, options).map((scenario) => [
      scenario.providerId,
      scenario.rank !== undefined ? `#${scenario.rank}` : 'Not eligible',
      scenario.available ? 'yes' : 'no',
      scenario.intervalCostUsd !== undefined ? formatNumber(scenario.intervalCostUsd) : '',
      scenario.monthlyCostUsd !== undefined ? formatNumber(scenario.monthlyCostUsd) : '',
      scenario.yearlyCostUsd !== undefined ? formatNumber(scenario.yearlyCostUsd) : '',
      scenario.deltaVsLowestMonthlyUsd !== undefined
        ? formatNumber(scenario.deltaVsLowestMonthlyUsd)
        : '',
      scenario.annualAvoidableSpendUsd !== undefined
        ? formatNumber(scenario.annualAvoidableSpendUsd)
        : '',
      scenario.approximateLineItemCount.toString(),
      scenario.caveat,
    ]),
  ];
}

export function pricingModelAvailabilityRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      ...REPORT_PRICING_MODELS.map((pricingModel) => labelForPricingModel(pricingModel)),
      'Evidence note',
    ],
    ...result.providers.map((provider) => [
      provider.providerId,
      ...REPORT_PRICING_MODELS.map((pricingModel) => pricingModelStatus(provider, pricingModel)),
      providerAvailabilityNote(provider),
    ]),
  ];
}

export function commitmentTcoRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Pricing model',
      'Available',
      'Effective hourly USD',
      'Monthly recurring USD',
      'Upfront cash USD',
      'Payment option',
      'Term',
      'Term TCO USD',
      'Savings vs on-demand',
      'Evidence',
    ],
    ...result.providers.flatMap((provider) =>
      REPORT_PRICING_MODELS.map((pricingModel) => {
        const model = modelCostForProvider(provider, pricingModel);
        const termMonths = termMonthsForModel(model, pricingModel);
        const monthly = model.available ? model.monthlyCostUsd : undefined;
        const hourly =
          model.available && monthly !== undefined
            ? (model.hourlyCostUsd ?? monthly / HOURS_PER_MONTH)
            : undefined;
        const upfront = model.available ? model.upfrontCostUsd : undefined;
        const termTco =
          monthly !== undefined && termMonths !== undefined
            ? monthly * termMonths + (upfront ?? 0)
            : undefined;

        return [
          provider.providerId,
          labelForPricingModel(pricingModel),
          model.available ? 'yes' : 'no',
          hourly !== undefined ? formatNumber(hourly) : '',
          monthly !== undefined ? formatNumber(monthly) : '',
          upfront !== undefined ? formatNumber(upfront) : '',
          paymentOptionEvidence(model),
          termMonths !== undefined ? `${termMonths} months` : termEvidence(pricingModel),
          termTco !== undefined ? formatNumber(termTco) : '',
          model.savingsPercentVsOnDemand !== undefined
            ? `${formatNumber(model.savingsPercentVsOnDemand)}%`
            : '',
          commitmentEvidence(model),
        ];
      }),
    ),
  ];
}

export function egressTierBreakdownRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) =>
    provider.lineItems
      .filter((lineItem) => lineItem.costComponent === 'egress' || lineItem.category === 'network')
      .flatMap((lineItem) => {
        const tiers = lineItem.egressTiers ?? [];

        if (tiers.length > 0) {
          const totalBillableGb = tiers.reduce((sum, tier) => sum + tier.billableGb, 0);
          const effectiveRate =
            totalBillableGb > 0 ? lineItem.baseMonthlyCostUsd / totalBillableGb : undefined;

          return tiers.map((tier) => [
            provider.providerId,
            lineItem.region ?? '',
            tierBandLabel(tier.tierFromGb, tier.tierToGb),
            formatNumber(tier.billableGb),
            formatNumber(tier.pricePerGb),
            formatNumber(tier.monthlyCostUsd),
            effectiveRate !== undefined ? formatNumber(effectiveRate) : '',
            `${lineItem.pricingBasis ?? 'tiered'} catalog tier: ${lineItem.description}`,
          ]);
        }

        if (lineItem.baseMonthlyCostUsd <= 0) {
          return [];
        }

        return [
          [
            provider.providerId,
            lineItem.region ?? '',
            lineItem.pricingBasis === 'tiered' ? 'Tier subtotal' : 'Flat / blended',
            '',
            lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
            formatNumber(lineItem.baseMonthlyCostUsd),
            '',
            `${lineItem.pricingBasis ?? 'flat'} egress line item without tier trace rows: ${lineItem.description}`,
          ],
        ];
      }),
  );

  return [
    [
      'Provider',
      'Region',
      'Tier band',
      'Billable GB',
      'Rate per GB USD',
      'Tier subtotal USD',
      'Effective blended USD/GB',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No egress tier rows were attached to this comparison.', '', '', '', '', '', '', '']]),
  ];
}

export function reportAssumptionRows(result: ComparisonResult): string[][] {
  const warningCount = result.warnings?.length ?? 0;
  const approximateLineItems = result.providers.reduce(
    (count, provider) =>
      count + provider.lineItems.filter((lineItem) => lineItem.isApproximate).length,
    0,
  );

  return [
    ['Assumption', 'How to read it'],
    [
      'Currency',
      'All values are USD estimates; taxes, credits, and private enterprise discounts are excluded unless present in the pricing catalog or modeled as explicit line items.',
    ],
    [
      'Time normalization',
      'Monthly cost uses 730 hours. Quarterly and yearly figures are arithmetic projections from the selected monthly run rate.',
    ],
    [
      'Pricing source',
      warningCount > 0
        ? `Cached provider catalog rates with ${warningCount} warning(s) captured in this export.`
        : 'Cached provider catalog rates; live refresh results are reflected only when the comparison was refreshed successfully.',
    ],
    [
      'Commitment scenarios',
      'Reserved, Savings Plan/CUD, and Spot scenarios are ranked only when provider evidence is available. Non-compute line items remain on-demand in commitment views.',
    ],
    [
      'Approximate mappings',
      approximateLineItems > 0
        ? `${approximateLineItems} line item(s) are approximate and should be reviewed by a solution architect before commitment.`
        : 'No approximate line items were flagged by the service-equivalence mapper.',
    ],
    [
      'Production-depth assumptions',
      'Support plans, Windows licensing, scheduled/bursty utilization, and resilience premiums appear as modeled line items when provided in the workload profile.',
    ],
    [
      'Decision use',
      'This report is designed for directional, decision-grade comparison, not invoice reconciliation to the cent.',
    ],
  ];
}

export function serviceRequirementRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements?.serviceRequirements ?? [];

  if (requirements.length === 0) {
    return [['No normalized service requirements were attached to this comparison.']];
  }

  return [
    ['Category', 'Service type', 'Instance/tier', 'Region', 'AZ', 'Quantity', 'Scale parameters'],
    ...requirements.map((requirement) => [
      requirement.serviceCategory,
      requirement.serviceType,
      [requirement.instanceType, requirement.tier].filter(Boolean).join(' / '),
      requirement.region ?? '',
      requirement.az ?? '',
      requirement.quantity.toString(),
      requirement.scaleParams ? scaleParamsText(requirement.scaleParams) : '',
    ]),
  ];
}

export function selectedScenarioRows(result: ComparisonResult, options: ReportOptions): string[][] {
  const pricingModel = options.pricingModel ?? 'on-demand';
  const interval = options.interval ?? 'monthly';

  return [
    ['Provider', 'Available', `${labelForInterval(interval)} USD`, 'Monthly USD', 'Hourly USD', 'Caveat'],
    ...result.providers.map((provider) => {
      const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);
      const monthly = selectedMonthlyCost(model, provider.totals.monthly);
      const available = pricingModel === 'on-demand' || model?.available === true;

      return [
        provider.providerId,
        available ? 'yes' : 'no',
        available ? formatNumber(costForInterval(monthly, interval)) : '',
        available ? formatNumber(monthly) : '',
        available ? formatNumber(model?.hourlyCostUsd ?? monthly / HOURS_PER_MONTH) : '',
        scenarioCaveat(pricingModel, model),
      ];
    }),
  ];
}

export function lineItemEvidenceRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Category',
      'Description',
      'Region',
      'Unit',
      'Unit price USD',
      'Hourly USD',
      'Monthly USD',
      'Calculation',
      'Pricing model evidence',
    ],
    ...result.providers.flatMap((provider) =>
      provider.lineItems.map((lineItem) => [
        provider.providerId,
        lineItem.category,
        lineItem.description,
        lineItem.region ?? '',
        lineItem.unit ?? '',
        lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
        lineItem.baseHourlyCostUsd !== undefined ? formatNumber(lineItem.baseHourlyCostUsd) : '',
        formatNumber(lineItem.baseMonthlyCostUsd),
        calculationText(lineItem),
        pricingModelEvidence(lineItem),
      ]),
    ),
  ];
}

export function providerCostDetailRows(result: ComparisonResult): string[][] {
  return [
    [
      'Row type',
      'Provider',
      'Category',
      'Cost component',
      'Description',
      'SKU',
      'Region',
      'Monthly USD',
      'Share of provider total',
      'Confidence',
      'Calculation',
    ],
    ...result.providers.flatMap((provider) => providerCostDetailRowsForProvider(provider)),
  ];
}

export function costCoverageMapRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Cost dimension',
      'Coverage status',
      'Priced rows',
      'Approximate rows',
      'Monthly USD',
      'Evidence',
      'Review cue',
    ],
    ...result.providers.flatMap((provider) =>
      COST_COVERAGE_DIMENSIONS.map((dimension) =>
        costCoverageMapRow(result, provider, dimension),
      ),
    ),
  ];
}

export function methodologySourceRows(result: ComparisonResult): string[][] {
  const warningCount = result.warnings?.length ?? 0;
  const lineItems = result.providers.flatMap((provider) => provider.lineItems);
  const approximateCount = lineItems.filter((lineItem) => lineItem.isApproximate).length;
  const modeledSkuCount = lineItems.filter((lineItem) =>
    lineItem.skuId?.startsWith('modeled-'),
  ).length;
  const tieredEgressRows = lineItems.reduce(
    (count, lineItem) => count + (lineItem.egressTiers?.length ?? 0),
    0,
  );

  return [
    ['Area', 'Source / method', 'Reviewer action'],
    [
      'Pricing snapshot',
      `Comparison pricingAsOf is ${result.pricingAsOf}; totals are generated from cached provider catalog rows and explicit modeled cost rows, not request-time calculator calls.`,
      'Refresh cached pricing before final vendor commitment and confirm private discounts, credits, taxes, and negotiated enterprise terms separately.',
    ],
    [
      'Provider catalog APIs',
      'AWS catalog rows originate from AWS Price List bulk offer files; Azure rows originate from Azure Retail Prices API; GCP rows originate from Cloud Billing Catalog API when credentials are configured.',
      'Use the SKU Mapping Appendix to trace each exported line item back to provider, SKU, region, unit, rate, and pricing-basis evidence.',
    ],
    [
      'Modeled fallback rows',
      `${modeledSkuCount} line item(s) use PolyCost modeled SKU IDs for cost dimensions that are not yet resolved to a provider catalog SKU.`,
      'Treat modeled rows as decision-grade estimates and replace with provider calculator evidence before procurement.',
    ],
    [
      'Time normalization',
      'All monthly run-rate math uses the shared 730-hours/month constant; hourly, quarterly, and yearly values derive from that monthly baseline.',
      'Do not mix calendar-month hour counts in external spreadsheets unless the whole model is recalculated consistently.',
    ],
    [
      'Egress tiering',
      tieredEgressRows > 0
        ? `${tieredEgressRows} explicit egress tier row(s) are attached to line items and exported in the egress breakdown.`
        : 'No explicit egress tier rows were attached; flat or blended network line items are labeled as such.',
      'For high-volume traffic, validate source/destination region pair, CDN hit ratio, NAT path, and inter-AZ/inter-region transfer separately.',
    ],
    [
      'Commitment and spot evidence',
      'Reserved, Savings Plan/CUD, and Spot rows are included only when provider evidence is available; unavailable models stay blank instead of being inferred.',
      'Confirm term, upfront option, commitment coverage, and interruptibility tolerance with workload owners before relying on savings projections.',
    ],
    [
      'Equivalence confidence',
      approximateCount > 0
        ? `${approximateCount} approximate mapping(s) require solution-architect review.`
        : 'No approximate line items are flagged in this comparison.',
      'Review workload requirement, resolved SKU, region, service family, and confidence columns in the SKU Mapping Appendix.',
    ],
    [
      'Cost allocation and governance',
      result.requirements?.workloadProfile?.tags?.length
        ? `Report includes ${result.requirements.workloadProfile.tags.length} cost-allocation tag(s) from the workload profile.`
        : 'No cost-allocation tags were supplied in the workload profile.',
      'Carry tags into IaC/provider billing labels so the estimate can be reconciled with future actuals.',
    ],
    [
      'Warnings',
      warningCount > 0
        ? `${warningCount} warning(s) were captured with this comparison.`
        : 'No provider or live-refresh warnings were captured with this comparison.',
      'Resolve warning rows before using the report as a final proposal artifact.',
    ],
  ];
}

export function skuMappingAppendixRows(result: ComparisonResult): string[][] {
  const requirements = result.requirements?.serviceRequirements ?? [];
  const rows = result.providers.flatMap((provider) =>
    provider.lineItems.map((lineItem) => {
      const requirement = requirements.find(
        (candidate) => candidate.serviceCategory === lineItem.category,
      );

      return [
        provider.providerId,
        lineItem.category,
        lineItem.costComponent ?? lineItem.category,
        serviceRequirementLabel(requirement, lineItem.category),
        lineItem.skuId ?? 'No SKU supplied',
        lineItem.description,
        lineItem.region ?? result.requirements?.regionPreference ?? '',
        lineItem.unit ?? '',
        lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
        lineItem.baseHourlyCostUsd !== undefined ? formatNumber(lineItem.baseHourlyCostUsd) : '',
        formatNumber(lineItem.baseMonthlyCostUsd),
        lineItem.isApproximate ? 'Approximate' : 'Mapped',
        lineItem.pricingBasis ?? 'flat',
        calculationText(lineItem),
        pricingModelEvidence(lineItem),
      ];
    }),
  );

  return [
    [
      'Provider',
      'Category',
      'Cost component',
      'User service',
      'Resolved SKU',
      'Description',
      'Region',
      'Unit',
      'Unit price USD',
      'Hourly USD',
      'Monthly USD',
      'Confidence',
      'Pricing basis',
      'Calculation',
      'Pricing model evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No SKU mapping rows were attached to this comparison.', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]),
  ];
}

export function optimizationOpportunityRows(result: ComparisonResult): string[][] {
  const rows: string[][] = [];
  const commitmentCandidates = commitmentPricingModelCandidates(result.requirements?.workloadProfile);
  const rankedOnDemand = rankedProviderScenarios(result, {
    interval: 'monthly',
    pricingModel: 'on-demand',
  }).filter((scenario) => scenario.available && scenario.monthlyCostUsd !== undefined);
  const cheapest = rankedOnDemand.find((scenario) => scenario.rank === 1);
  const highest = rankedOnDemand.at(-1);

  if (
    cheapest?.monthlyCostUsd !== undefined &&
    highest?.monthlyCostUsd !== undefined &&
    highest.providerId !== cheapest.providerId
  ) {
    const monthlySavings = highest.monthlyCostUsd - cheapest.monthlyCostUsd;
    rows.push([
      'Provider selection',
      `Shortlist ${cheapest.providerId} before committing to ${highest.providerId}.`,
      formatNumber(monthlySavings),
      formatNumber(monthlySavings * 12),
      'High',
      'Medium',
      `Provider delta from current cached comparison: ${highest.providerId} $${formatNumber(
        highest.monthlyCostUsd,
      )}/mo vs ${cheapest.providerId} $${formatNumber(cheapest.monthlyCostUsd)}/mo.`,
    ]);
  }

  for (const provider of result.providers) {
    const onDemand = modelCostForProvider(provider, 'on-demand');
    const targetCoveragePercent = commitmentPreferencePercent(result);
    const targetCoverageRate = targetCoveragePercent / 100;
    const bestCommitment = commitmentCandidates
      .map((pricingModel) => modelCostForProvider(provider, pricingModel as ReportPricingModel))
      .filter(
        (model) =>
          model.available &&
          model.monthlyCostUsd !== undefined &&
          onDemand.monthlyCostUsd !== undefined &&
          model.monthlyCostUsd < onDemand.monthlyCostUsd,
      )
      .sort((left, right) => (left.monthlyCostUsd ?? 0) - (right.monthlyCostUsd ?? 0))[0];

    if (bestCommitment?.monthlyCostUsd !== undefined && onDemand.monthlyCostUsd !== undefined) {
      const monthlySavings = onDemand.monthlyCostUsd - bestCommitment.monthlyCostUsd;
      const targetBlendMonthly =
        onDemand.monthlyCostUsd * (1 - targetCoverageRate) +
        bestCommitment.monthlyCostUsd * targetCoverageRate;
      const openGapMonthly = Math.max(0, targetBlendMonthly - bestCommitment.monthlyCostUsd);
      const remainingOpportunity = roundCurrency(openGapMonthly);

      if (remainingOpportunity <= 0) {
        continue;
      }

      rows.push([
        'Commitment coverage',
        `${provider.providerId} ${labelForPricingModel(
          bestCommitment.model,
        )} lowers recurring run rate; ${formatNumber(
          100 - targetCoveragePercent,
        )}% remains exposed at the target coverage setting.`,
        formatNumber(remainingOpportunity),
        formatNumber(remainingOpportunity * 12),
        remainingOpportunity > 100 ? 'High' : 'Medium',
        bestCommitment.model === 'reserved-3yr' ? 'High' : 'Medium',
        `${provider.providerId} on-demand $${formatNumber(
          onDemand.monthlyCostUsd,
        )}/mo vs ${bestCommitment.model} $${formatNumber(
          bestCommitment.monthlyCostUsd,
        )}/mo; ${formatNumber(targetCoveragePercent)}% target blend is $${formatNumber(
          targetBlendMonthly,
        )}/mo and 100% coverage would save $${formatNumber(monthlySavings)}/mo.`,
      ]);
    }
  }

  const usagePattern = result.requirements?.workloadProfile?.usagePattern;
  const averageUtilization =
    usagePattern?.type === 'bursty' ? usagePattern.averageUtilizationPercent : undefined;
  const rightSizingRate = rightSizingSavingsRate(averageUtilization);

  if (rightSizingRate > 0 && averageUtilization !== undefined) {
    for (const provider of result.providers) {
      const computeMonthly = componentMonthly(provider, 'compute');

      if (computeMonthly <= 0) {
        continue;
      }

      const monthlySavings = computeMonthly * rightSizingRate;

      rows.push([
        'Right-sizing',
        `${provider.providerId} compute averages ${formatNumber(
          averageUtilization,
        )}% utilization; evaluate smaller instance sizes, autoscaling bounds, or scheduled capacity before committing.`,
        formatNumber(monthlySavings),
        formatNumber(monthlySavings * 12),
        monthlySavings > 100 ? 'High' : 'Medium',
        'Medium',
        `Rule-based ${formatNumber(
          rightSizingRate * 100,
        )}% compute-spend opportunity from $${formatNumber(computeMonthly)}/mo compute baseline.`,
      ]);
    }
  }

  rows.push(...computeSpecificationOpportunityRows(result));

  for (const provider of result.providers) {
    const spotInsight = spotBlendInsight(result, provider);

    if (!spotInsight) {
      continue;
    }

    rows.push([
      'Spot blend',
      `${provider.providerId} can model a ${formatNumber(
        spotInsight.onDemandPercent,
      )}% on-demand / ${formatNumber(
        spotInsight.spotPercent,
      )}% spot blend for interruptible capacity.`,
      formatNumber(spotInsight.monthlySavings),
      formatNumber(spotInsight.monthlySavings * 12),
      spotInsight.risk === 'High' ? 'Medium' : 'High',
      spotInsight.risk,
      spotInsight.evidence,
    ]);
  }

  for (const provider of result.providers) {
    const storageMonthly = componentMonthly(provider, 'storage');
    const providerMonthly = provider.totals.monthly;
    const storageShare = providerMonthly > 0 ? storageMonthly / providerMonthly : 0;
    const insight = storageOptimizationInsight(provider);
    const isMaterial =
      storageMonthly >= 10 || storageShare >= 0.1 || Boolean(insight?.hasAdvancedSignal);

    if (!insight || !isMaterial) {
      continue;
    }

    rows.push([
      'Storage optimization',
      `${provider.providerId} storage is ${formatNumber(
        storageShare * 100,
      )}% of monthly spend; ${insight.recommendation}`,
      formatNumber(insight.monthlySavings),
      formatNumber(insight.monthlySavings * 12),
      insight.monthlySavings > 100 ? 'High' : insight.monthlySavings > 20 ? 'Medium' : 'Low',
      insight.effort,
      insight.evidence,
    ]);
  }

  rows.push(...storageAnatomyOpportunityRows(result));

  for (const provider of result.providers) {
    const databaseMonthly = databaseIntelligenceMonthly(provider);
    const providerMonthly = provider.totals.monthly;
    const databaseShare = providerMonthly > 0 ? databaseMonthly / providerMonthly : 0;
    const insight = databaseOptimizationInsight(provider);
    const isMaterial =
      databaseMonthly >= 10 || databaseShare >= 0.1 || Boolean(insight?.hasAdvancedSignal);

    if (!insight || !isMaterial) {
      continue;
    }

    rows.push([
      'Database optimization',
      `${provider.providerId} database and analytics data services are ${formatNumber(
        databaseShare * 100,
      )}% of monthly spend; ${insight.recommendation}`,
      formatNumber(insight.monthlySavings),
      formatNumber(insight.monthlySavings * 12),
      insight.monthlySavings > 100 ? 'High' : insight.monthlySavings > 20 ? 'Medium' : 'Low',
      insight.effort,
      insight.evidence,
    ]);
  }

  rows.push(...databaseAnatomyOpportunityRows(result));

  for (const provider of result.providers) {
    const runtimeMonthly = runtimeIntelligenceMonthly(provider);
    const providerMonthly = provider.totals.monthly;
    const runtimeShare = providerMonthly > 0 ? runtimeMonthly / providerMonthly : 0;
    const insight = runtimeOptimizationInsight(provider);
    const isMaterial =
      runtimeMonthly >= 10 || runtimeShare >= 0.1 || Boolean(insight?.hasAdvancedSignal);

    if (!insight || !isMaterial) {
      continue;
    }

    rows.push([
      'Runtime optimization',
      `${provider.providerId} serverless/container runtime is ${formatNumber(
        runtimeShare * 100,
      )}% of monthly spend; ${insight.recommendation}`,
      formatNumber(insight.monthlySavings),
      formatNumber(insight.monthlySavings * 12),
      insight.monthlySavings > 100 ? 'High' : insight.monthlySavings > 20 ? 'Medium' : 'Low',
      insight.effort,
      insight.evidence,
    ]);
  }

  const serverlessCurve = serverlessMemoryCurveAssumptions(result);

  if (serverlessCurve.requestsMillion > 0) {
    for (const provider of result.providers) {
      const currentMonthly = serverlessFunctionMonthly(provider.providerId, {
        requestsMillion: serverlessCurve.requestsMillion,
        durationMs: serverlessCurve.durationMs,
        memoryMb: serverlessCurve.memoryMb,
      });
      const breakEvenMemoryMb = serverlessCurve.memoryMb * 2;
      const breakEvenDurationMs =
        (serverlessCurve.durationMs * serverlessCurve.memoryMb) / breakEvenMemoryMb;
      const modeledMonthly = serverlessFunctionMonthly(provider.providerId, {
        requestsMillion: serverlessCurve.requestsMillion,
        durationMs: breakEvenDurationMs,
        memoryMb: breakEvenMemoryMb,
      });
      const monthlyDelta = roundCurrency(Math.abs(modeledMonthly - currentMonthly));

      rows.push([
        'Serverless memory curve',
        `${provider.providerId} function memory break-even: ${formatNumber(
          breakEvenMemoryMb,
        )}MB must run at or below ${formatNumber(
          breakEvenDurationMs,
        )}ms to keep GB-second cost flat while improving latency.`,
        formatNumber(monthlyDelta),
        formatNumber(monthlyDelta * 12),
        monthlyDelta > 100 ? 'High' : monthlyDelta > 20 ? 'Medium' : 'Low',
        'Low',
        `${provider.providerId} current function shape is ${formatNumber(
          serverlessCurve.requestsMillion,
        )}M invocations/month at ${formatNumber(serverlessCurve.durationMs)}ms and ${formatNumber(
          serverlessCurve.memoryMb,
        )}MB: $${formatNumber(currentMonthly)}/mo current vs $${formatNumber(
          modeledMonthly,
        )}/mo at the linear memory-duration knee.`,
      ]);
    }
  }

  const appPlatformModel = appPlatformModelAssumptions(result);

  if (appPlatformModel.requestsMillion > 0 || appPlatformModel.hasRequirement) {
    for (const provider of result.providers) {
      const requestMonthly = appPlatformRequestLineMonthly(provider) ||
        appPlatformRequestMonthly(provider.providerId, appPlatformModel);
      const alwaysOnMonthly = appPlatformAlwaysOnMonthly(provider.providerId, appPlatformModel);
      const monthlySavings = roundCurrency(Math.abs(alwaysOnMonthly - requestMonthly));

      if (requestMonthly <= 0 && alwaysOnMonthly <= 0) {
        continue;
      }

      const winner = requestMonthly <= alwaysOnMonthly ? 'request-based' : 'always-on';
      const loser = winner === 'request-based' ? 'always-on' : 'request-based';
      const validationCue =
        winner === 'request-based'
          ? `validate ${loser} only if traffic becomes steady`
          : `validate ${loser} only if idle windows or traffic spikes dominate`;

      rows.push([
        'App platform model',
        `${provider.providerId} ${winner} app-hosting posture is favored for the configured traffic; ${validationCue}.`,
        formatNumber(monthlySavings),
        formatNumber(monthlySavings * 12),
        monthlySavings > 100 ? 'High' : monthlySavings > 20 ? 'Medium' : 'Low',
        'Low',
        `${provider.providerId} request-based model $${formatNumber(
          requestMonthly,
        )}/mo vs always-on $${formatNumber(alwaysOnMonthly)}/mo for ${formatNumber(
          appPlatformModel.requestsMillion,
        )}M requests, ${formatNumber(appPlatformModel.durationMs)}ms, ${formatNumber(
          appPlatformModel.vcpu,
        )} vCPU, ${formatNumber(appPlatformModel.memoryGb)}GB, ${formatNumber(
          appPlatformModel.minInstances,
        )} minimum instance(s), ${formatNumber(appPlatformModel.alwaysOnHours)} hrs/mo.`,
      ]);
    }
  }

  for (const provider of result.providers) {
    const operationsMonthly = operationsIntelligenceMonthly(provider);
    const providerMonthly = provider.totals.monthly;
    const operationsShare = providerMonthly > 0 ? operationsMonthly / providerMonthly : 0;
    const insight = operationsOptimizationInsight(provider);
    const isMaterial =
      operationsMonthly >= 10 || operationsShare >= 0.1 || Boolean(insight?.hasAdvancedSignal);

    if (!insight || !isMaterial) {
      continue;
    }

    rows.push([
      'Operations optimization',
      `${provider.providerId} observability/security operations are ${formatNumber(
        operationsShare * 100,
      )}% of monthly spend; ${insight.recommendation}`,
      formatNumber(insight.monthlySavings),
      formatNumber(insight.monthlySavings * 12),
      insight.monthlySavings > 100 ? 'High' : insight.monthlySavings > 20 ? 'Medium' : 'Low',
      insight.effort,
      insight.evidence,
    ]);
  }

  rows.push(...architectureRiskOpportunityRows(result));

  for (const provider of result.providers) {
    const dataPathMonthly =
      componentMonthly(provider, 'egress') + componentMonthly(provider, 'networking');
    const providerMonthly = provider.totals.monthly;

    if (providerMonthly > 0 && dataPathMonthly / providerMonthly >= 0.2) {
      const insight = egressOptimizationInsight(provider);
      rows.push([
        'Egress optimization',
        `${provider.providerId} egress and networking are ${formatNumber(
          (dataPathMonthly / providerMonthly) * 100,
        )}% of monthly spend; ${insight.recommendation}`,
        formatNumber(insight.monthlySavings),
        formatNumber(insight.monthlySavings * 12),
        'High',
        insight.effort,
        insight.evidence,
      ]);
    }
  }

  for (const provider of result.providers) {
    const licensingMonthly = componentMonthly(provider, 'licensing');

    if (licensingMonthly > 0) {
      const linuxEquivalentMonthly = Math.max(0, provider.totals.monthly - licensingMonthly);
      const licensePath =
        provider.providerId === 'azure' ? 'Azure Hybrid Benefit/BYOL' : 'Linux equivalent or BYOL';

      rows.push([
        'License optimization',
        `${provider.providerId} includes Windows/licensing cost; validate ${licensePath} eligibility before committing.`,
        formatNumber(licensingMonthly),
        formatNumber(licensingMonthly * 12),
        'Medium',
        'Medium',
        `Windows run-rate $${formatNumber(
          provider.totals.monthly,
        )}/mo vs Linux/BYOL-equivalent $${formatNumber(
          linuxEquivalentMonthly,
        )}/mo; explicit licensing uplift is $${formatNumber(licensingMonthly)}/mo.`,
      ]);
    }
  }

  for (const provider of result.providers) {
    const approximateCount = provider.lineItems.filter((lineItem) => lineItem.isApproximate).length;

    if (approximateCount > 0) {
      rows.push([
        'Mapping validation',
        `${provider.providerId} has ${approximateCount} approximate mapped line item(s); review equivalence before proposal finalization.`,
        '',
        '',
        'Medium',
        'Low',
        'Approximate service mappings can change the recommended provider when SKUs are not truly equivalent.',
      ]);
    }
  }

  return [
    [
      'Opportunity',
      'Recommendation',
      'Estimated monthly savings USD',
      'Estimated annual savings USD',
      'Priority',
      'Effort',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [
          [
            'No material optimization opportunity detected',
            'Current comparison does not expose provider spread, commitment, storage, database, runtime, operations, egress, licensing, or mapping signals above thresholds.',
            '',
            '',
            'Low',
            'Low',
            'Continue validating SKU equivalence and private-discount assumptions.',
          ],
        ]),
  ];
}

export function egressNetworkingDetailRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) =>
    provider.lineItems
      .filter(
        (lineItem) =>
          lineItem.category === 'network' ||
          lineItem.costComponent === 'egress' ||
          networkDescription(lineItem.description),
      )
      .map((lineItem) => [
        provider.providerId,
        lineItem.costComponent ?? lineItem.category,
        lineItem.description,
        lineItem.region ?? '',
        formatNumber(lineItem.baseMonthlyCostUsd),
        provider.totals.monthly > 0
          ? `${formatNumber((lineItem.baseMonthlyCostUsd / provider.totals.monthly) * 100)}%`
          : '',
        lineItem.unit ?? '',
        lineItem.unitPriceUsd !== undefined ? formatNumber(lineItem.unitPriceUsd) : '',
        lineItem.egressTiers?.length
          ? `${lineItem.egressTiers.length} tier(s): ${lineItem.egressTiers
              .map((tier) => `${tierBandLabel(tier.tierFromGb, tier.tierToGb)} @ $${formatNumber(tier.pricePerGb)}/GB`)
              .join('; ')}`
          : `${lineItem.pricingBasis ?? 'flat'} network cost evidence`,
      ]),
  );

  return [
    [
      'Provider',
      'Network component',
      'Description',
      'Region',
      'Monthly USD',
      'Share of provider total',
      'Unit',
      'Rate USD',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No networking or egress line items were attached to this comparison.', '', '', '', '', '', '', '', '']]),
  ];
}

export function regionComparisonEvidenceRows(
  result: ComparisonResult,
): RegionComparisonEvidenceRow[] {
  return result.providers.flatMap((provider) =>
    REGION_VARIANCE_PROFILES.map((profile) => {
      const modeledMonthlyUsd = roundCurrency(provider.totals.monthly * profile.multiplier);

      return {
        providerId: provider.providerId,
        comparisonRegion: profile.region,
        providerRegion: providerRegionLabel(provider.providerId, profile.region),
        modeledMonthlyUsd,
        deltaVsSelectedMonthlyUsd: roundCurrency(modeledMonthlyUsd - provider.totals.monthly),
        multiplier: profile.multiplier,
        evidence: profile.evidence,
      };
    }),
  );
}

export function regionComparisonRows(result: ComparisonResult): string[][] {
  return [
    [
      'Provider',
      'Comparison region',
      'Provider region',
      'Modeled monthly USD',
      'Delta vs selected region USD',
      'Multiplier',
      'Evidence',
    ],
    ...regionComparisonEvidenceRows(result).map((row) => [
      row.providerId,
      row.comparisonRegion,
      row.providerRegion,
      formatNumber(row.modeledMonthlyUsd),
      formatNumber(row.deltaVsSelectedMonthlyUsd),
      formatNumber(row.multiplier),
      row.evidence,
    ]),
  ];
}

export function breakEvenSummaryRows(result: ComparisonResult): string[][] {
  const rows = result.providers.flatMap((provider) => {
    const onDemand = modelCostForProvider(provider, 'on-demand');

    if (onDemand.monthlyCostUsd === undefined) {
      return [];
    }

    const onDemandMonthly = onDemand.monthlyCostUsd;

    return ['reserved-1yr', 'reserved-3yr', 'savings-plan'].flatMap((pricingModel) => {
      const model = modelCostForProvider(provider, pricingModel as ReportPricingModel);

      if (!model.available || model.monthlyCostUsd === undefined) {
        return [];
      }

      const monthlySavings = onDemandMonthly - model.monthlyCostUsd;
      const upfront = model.upfrontCostUsd ?? 0;
      const breakEvenMonth =
        monthlySavings > 0 ? Math.max(0, Math.ceil(upfront / monthlySavings)) : undefined;

      return [
        [
          provider.providerId,
          labelForPricingModel(model.model),
          formatNumber(onDemandMonthly),
          formatNumber(model.monthlyCostUsd),
          formatNumber(upfront),
          monthlySavings > 0 ? formatNumber(monthlySavings) : '',
          breakEvenMonth !== undefined ? breakEvenMonth.toString() : 'No break-even',
          model.caveat ?? commitmentEvidence(model),
        ],
      ];
    });
  });

  return [
    [
      'Provider',
      'Pricing model',
      'On-demand monthly USD',
      'Committed monthly USD',
      'Upfront USD',
      'Monthly savings USD',
      'Break-even month',
      'Evidence',
    ],
    ...(rows.length > 0
      ? rows
      : [['No commitment model has enough pricing evidence for break-even analysis.', '', '', '', '', '', '', '']]),
  ];
}

export function labelForInterval(interval: ReportInterval): string {
  switch (interval) {
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'yearly':
      return 'Yearly';
  }
}

export function labelForPricingModel(pricingModel: ReportPricingModel): string {
  switch (pricingModel) {
    case 'on-demand':
      return 'On-demand';
    case 'reserved-1yr':
      return 'Reserved 1-year';
    case 'reserved-3yr':
      return 'Reserved 3-year';
    case 'savings-plan':
      return 'Savings Plan / CUD';
    case 'spot':
      return 'Spot estimate range';
  }
}

function serviceRequirementLabel(
  requirement: ServiceRequirement | undefined,
  fallbackCategory: string,
): string {
  if (!requirement) {
    return `${fallbackCategory} (no normalized requirement row)`;
  }

  return [
    `${requirement.serviceCategory}/${requirement.serviceType}`,
    requirement.instanceType,
    requirement.tier,
    requirement.region,
  ]
    .filter(Boolean)
    .join(' / ');
}

function architectureOverviewRow(
  result: ComparisonResult,
  requirement: ServiceRequirement,
): string[] {
  const providerMappings = result.providers.map((provider) =>
    architectureProviderMapping(provider, requirement.serviceCategory),
  );
  const confidence = architectureConfidence(providerMappings);

  return [
    requirement.serviceCategory,
    serviceRequirementLabel(requirement, requirement.serviceCategory),
    providerMappings.find((mapping) => mapping.providerId === 'aws')?.label ?? 'Not mapped',
    providerMappings.find((mapping) => mapping.providerId === 'azure')?.label ?? 'Not mapped',
    providerMappings.find((mapping) => mapping.providerId === 'gcp')?.label ?? 'Not mapped',
    confidence,
    architectureReviewCue(requirement, confidence),
  ];
}

function fallbackArchitectureOverviewRows(result: ComparisonResult): string[][] {
  const categories = [
    ...new Set(
      result.providers.flatMap((provider) => provider.lineItems.map((lineItem) => lineItem.category)),
    ),
  ];

  return categories.map((category) => {
    const providerMappings = result.providers.map((provider) =>
      architectureProviderMapping(provider, category),
    );
    const confidence = architectureConfidence(providerMappings);

    return [
      category,
      `${category} (derived from provider line items)`,
      providerMappings.find((mapping) => mapping.providerId === 'aws')?.label ?? 'Not mapped',
      providerMappings.find((mapping) => mapping.providerId === 'azure')?.label ?? 'Not mapped',
      providerMappings.find((mapping) => mapping.providerId === 'gcp')?.label ?? 'Not mapped',
      confidence,
      'Attach normalized service requirements to verify equivalence beyond category-level evidence.',
    ];
  });
}

function architectureProviderMapping(
  provider: ComparisonProviderResult,
  category: string,
): {
  providerId: ComparisonProviderResult['providerId'];
  label: string;
  hasMapping: boolean;
  hasApproximate: boolean;
} {
  const lineItems = provider.lineItems
    .filter((lineItem) => lineItem.category === category)
    .sort((left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd);
  const primary = lineItems[0];

  if (!primary) {
    return {
      providerId: provider.providerId,
      label: 'Not mapped',
      hasMapping: false,
      hasApproximate: false,
    };
  }

  const sku = primary.skuId ? `SKU ${primary.skuId}` : 'no SKU';

  return {
    providerId: provider.providerId,
    label: `${primary.description} (${sku}, $${formatNumber(primary.baseMonthlyCostUsd)}/mo)`,
    hasMapping: true,
    hasApproximate: lineItems.some((lineItem) => lineItem.isApproximate),
  };
}

function architectureConfidence(
  mappings: Array<ReturnType<typeof architectureProviderMapping>>,
): string {
  const mappedCount = mappings.filter((mapping) => mapping.hasMapping).length;

  if (mappedCount === 0) {
    return 'Missing';
  }

  if (mappedCount < mappings.length) {
    return 'Partial';
  }

  if (mappings.some((mapping) => mapping.hasApproximate)) {
    return 'Approximate';
  }

  return 'Mapped';
}

function architectureReviewCue(requirement: ServiceRequirement, confidence: string): string {
  if (confidence === 'Mapped') {
    return 'Validate regional availability, quotas, resilience, and final SKU sizing.';
  }

  if (confidence === 'Approximate') {
    return 'Review approximate equivalence with a solution architect before proposal sign-off.';
  }

  if (confidence === 'Partial') {
    return 'Complete missing provider mappings before using this service in a three-cloud decision.';
  }

  return `Map ${requirement.serviceCategory}/${requirement.serviceType} before publishing the report.`;
}

function providerCostDetailRowsForProvider(provider: ComparisonProviderResult): string[][] {
  const categoryTotals = new Map<string, number>();

  for (const lineItem of provider.lineItems) {
    const key = `${lineItem.category}:${lineItem.costComponent ?? lineItem.category}`;
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + lineItem.baseMonthlyCostUsd);
  }

  return [
    [
      'Provider total',
      provider.providerId,
      'all',
      'all',
      `${provider.providerId} monthly total`,
      '',
      '',
      formatNumber(provider.totals.monthly),
      '100%',
      provider.lineItems.some((lineItem) => lineItem.isApproximate)
        ? 'Review required'
        : 'Mapped',
      `${provider.lineItems.length} line item(s) roll up to $${formatNumber(
        provider.totals.monthly,
      )}/mo.`,
    ],
    ...[...categoryTotals.entries()].map(([key, monthly]) => {
      const [category, component] = key.split(':');

      return [
        'Category subtotal',
        provider.providerId,
        category,
        component,
        `${category} / ${component} subtotal`,
        '',
        '',
        formatNumber(monthly),
        provider.totals.monthly > 0
          ? `${formatNumber((monthly / provider.totals.monthly) * 100)}%`
          : '',
        provider.lineItems.some(
          (lineItem) =>
            lineItem.category === category &&
            (lineItem.costComponent ?? lineItem.category) === component &&
            lineItem.isApproximate,
        )
          ? 'Approximate'
          : 'Mapped',
        `${provider.providerId} subtotal across ${provider.lineItems.filter(
          (lineItem) =>
            lineItem.category === category &&
            (lineItem.costComponent ?? lineItem.category) === component,
        ).length} row(s).`,
      ];
    }),
    ...provider.lineItems.map((lineItem) => [
      'Line item',
      provider.providerId,
      lineItem.category,
      lineItem.costComponent ?? lineItem.category,
      lineItem.description,
      lineItem.skuId ?? '',
      lineItem.region ?? '',
      formatNumber(lineItem.baseMonthlyCostUsd),
      provider.totals.monthly > 0
        ? `${formatNumber((lineItem.baseMonthlyCostUsd / provider.totals.monthly) * 100)}%`
        : '',
      lineItem.isApproximate ? 'Approximate' : 'Mapped',
      calculationText(lineItem),
    ]),
  ];
}

function costCoverageMapRow(
  result: ComparisonResult,
  provider: ComparisonProviderResult,
  dimension: CostCoverageDimension,
): string[] {
  const matchingRows = provider.lineItems.filter((lineItem) => dimension.matches(lineItem));
  const monthly = matchingRows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
  const approximateRows = matchingRows.filter(
    (lineItem) =>
      lineItem.isApproximate ||
      lineItem.skuId?.startsWith('modeled-'),
  ).length;
  const hasRequirement = costCoverageDimensionConfigured(result, dimension);
  const status = costCoverageStatus({
    approximateRows,
    hasRequirement,
    matchingRows,
    provider,
  });

  return [
    provider.providerId,
    dimension.label,
    status,
    matchingRows.length.toString(),
    approximateRows.toString(),
    matchingRows.length > 0 ? formatNumber(monthly) : '',
    costCoverageEvidence(provider, matchingRows, hasRequirement),
    dimension.reviewCue,
  ];
}

function costCoverageDimensionConfigured(
  result: ComparisonResult,
  dimension: CostCoverageDimension,
): boolean {
  if (dimension.configured?.(result)) {
    return true;
  }

  return Boolean(
    result.requirements?.serviceRequirements.some((requirement) =>
      dimension.requirementCategories.includes(requirement.serviceCategory),
    ),
  );
}

function costCoverageStatus(input: {
  approximateRows: number;
  hasRequirement: boolean;
  matchingRows: ComparisonLineItem[];
  provider: ComparisonProviderResult;
}): string {
  if (input.matchingRows.length === 0) {
    return input.hasRequirement ? 'Missing priced row' : 'Not configured';
  }

  if (input.approximateRows > 0 || input.provider.totals.monthly <= 0) {
    return 'Partial';
  }

  return 'Covered';
}

function costCoverageEvidence(
  provider: ComparisonProviderResult,
  matchingRows: ComparisonLineItem[],
  hasRequirement: boolean,
): string {
  if (matchingRows.length === 0) {
    return hasRequirement
      ? `${provider.providerId} has a configured requirement but no priced row in this comparison.`
      : `${provider.providerId} has no configured or priced signal for this dimension.`;
  }

  const primary = [...matchingRows].sort(
    (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
  )[0];
  const modeledRows = matchingRows.filter((lineItem) => lineItem.skuId?.startsWith('modeled-')).length;
  const skuEvidence = primary.skuId ? `SKU ${primary.skuId}` : 'no SKU attached';

  return `${provider.providerId} has ${matchingRows.length} row(s); top driver "${primary.description}" is $${formatNumber(
    primary.baseMonthlyCostUsd,
  )}/mo (${skuEvidence}${modeledRows > 0 ? `; ${modeledRows} modeled row(s)` : ''}).`;
}

function selectedMonthlyCost(model: PricingModelCost | undefined, fallbackMonthly: number): number {
  return model?.available === true && model.monthlyCostUsd !== undefined
    ? model.monthlyCostUsd
    : fallbackMonthly;
}

function modelCostForProvider(
  provider: ComparisonProviderResult,
  pricingModel: ReportPricingModel,
): PricingModelCost {
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (model) {
    return model;
  }

  if (pricingModel === 'on-demand') {
    return {
      model: 'on-demand',
      available: true,
      monthlyCostUsd: provider.totals.monthly,
      hourlyCostUsd: provider.totals.hourly ?? provider.totals.monthly / HOURS_PER_MONTH,
      savingsPercentVsOnDemand: 0,
    };
  }

  return {
    model: pricingModel,
    available: false,
    unavailableReason: 'Not available for this configuration.',
  };
}

function termMonthsForModel(
  model: PricingModelCost,
  pricingModel: ReportPricingModel,
): number | undefined {
  if (model.commitmentTermMonths !== undefined) {
    return model.commitmentTermMonths;
  }

  if (pricingModel === 'reserved-1yr' || pricingModel === 'savings-plan') {
    return 12;
  }

  if (pricingModel === 'reserved-3yr') {
    return 36;
  }

  return undefined;
}

function paymentOptionEvidence(model: PricingModelCost): string {
  if (!model.available) {
    return 'N/A';
  }

  if (model.upfrontOption === 'all') {
    return 'All upfront';
  }

  if (model.upfrontOption === 'partial') {
    return 'Partial upfront';
  }

  if (model.upfrontOption === 'none') {
    return 'No upfront';
  }

  if (
    model.model === 'reserved-1yr' ||
    model.model === 'reserved-3yr' ||
    model.model === 'savings-plan'
  ) {
    return 'Provider default / not published';
  }

  return 'No commitment';
}

function termEvidence(pricingModel: ReportPricingModel): string {
  if (pricingModel === 'spot') {
    return 'Interruptible';
  }

  return 'No fixed term';
}

function commitmentEvidence(model: PricingModelCost): string {
  if (!model.available) {
    return model.unavailableReason ?? 'Not available for this configuration.';
  }

  return [
    model.providerTerm ?? model.displayName ?? labelForPricingModel(model.model),
    model.upfrontCostUsd !== undefined ? `upfront $${formatNumber(model.upfrontCostUsd)}` : undefined,
    model.estimated ? 'estimate' : undefined,
    model.volatility === 'volatile' ? 'volatile' : undefined,
    model.caveat,
  ]
    .filter(Boolean)
    .join(' · ');
}

function rankedProviderScenarios(
  result: ComparisonResult,
  options: ReportOptions,
): RankedProviderScenario[] {
  const scenarios = result.providers.map((provider) => providerScenario(provider, options));
  const eligible = scenarios
    .filter(
      (scenario): scenario is ProviderScenario & Required<Pick<ProviderScenario, 'monthlyCostUsd'>> =>
        scenario.available && scenario.monthlyCostUsd !== undefined,
    )
    .sort((left, right) => left.monthlyCostUsd - right.monthlyCostUsd);
  const lowestMonthly = eligible[0]?.monthlyCostUsd;
  const rankByProvider = new Map(
    eligible.map((scenario, index) => [scenario.providerId, index + 1]),
  );

  return [...eligible, ...scenarios.filter((scenario) => !scenario.available)].map(
    (scenario) => {
      const rank = rankByProvider.get(scenario.providerId);
      const deltaVsLowestMonthlyUsd =
        lowestMonthly !== undefined && scenario.monthlyCostUsd !== undefined
          ? roundCurrency(scenario.monthlyCostUsd - lowestMonthly)
          : undefined;

      return {
        ...scenario,
        ...(rank !== undefined ? { rank } : {}),
        ...(deltaVsLowestMonthlyUsd !== undefined
          ? {
              deltaVsLowestMonthlyUsd,
              annualAvoidableSpendUsd: roundCurrency(deltaVsLowestMonthlyUsd * 12),
            }
          : {}),
      };
    },
  );
}

function providerScenario(
  provider: ComparisonProviderResult,
  options: ReportOptions,
): ProviderScenario {
  const pricingModel = options.pricingModel ?? 'on-demand';
  const interval = options.interval ?? 'monthly';
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);
  const available = pricingModel === 'on-demand' || model?.available === true;
  const monthlyCostUsd = available ? selectedMonthlyCost(model, provider.totals.monthly) : undefined;

  return {
    providerId: provider.providerId,
    available,
    ...(monthlyCostUsd !== undefined
      ? {
          intervalCostUsd: costForInterval(monthlyCostUsd, interval),
          monthlyCostUsd,
          yearlyCostUsd: monthlyCostUsd * 12,
        }
      : {}),
    caveat: scenarioCaveat(pricingModel, model),
    approximateLineItemCount: provider.lineItems.filter((lineItem) => lineItem.isApproximate)
      .length,
  };
}

function evidenceConfidence(
  providerCount: number,
  approximateLineItems: number,
  warningCount: number,
): string {
  if (providerCount === 3 && approximateLineItems === 0 && warningCount === 0) {
    return 'High - all three providers priced with exact mappings and no export warnings.';
  }

  if (providerCount >= 2 && warningCount === 0) {
    return `Medium - ${providerCount}/3 providers priced with ${approximateLineItems} approximate mapping(s).`;
  }

  return `Review required - ${providerCount}/3 providers priced, ${approximateLineItems} approximate mapping(s), ${warningCount} warning(s).`;
}

function pricingModelStatus(
  provider: ComparisonProviderResult,
  pricingModel: ReportPricingModel,
): string {
  const model = provider.pricingModels?.find((candidate) => candidate.model === pricingModel);

  if (!model) {
    return pricingModel === 'on-demand' ? 'available' : 'not modeled';
  }

  if (!model.available) {
    return `unavailable: ${model.unavailableReason ?? 'not offered for this configuration'}`;
  }

  const savings =
    model.savingsPercentVsOnDemand !== undefined
      ? `; ${formatNumber(model.savingsPercentVsOnDemand)}% vs on-demand`
      : '';

  return `available${savings}`;
}

function providerAvailabilityNote(provider: ComparisonProviderResult): string {
  if (!provider.pricingModels || provider.pricingModels.length === 0) {
    return 'Only on-demand totals are modeled for this provider.';
  }

  const unavailableModels =
    provider.pricingModels
      ?.filter((model) => !model.available)
      .map((model) => `${labelForPricingModel(model.model)}: ${model.unavailableReason ?? 'unavailable'}`) ??
    [];

  if (unavailableModels.length === 0) {
    return 'All modeled pricing scenarios are eligible for ranking.';
  }

  return unavailableModels.join('; ');
}

function scenarioCaveat(
  pricingModel: ReportPricingModel,
  model: PricingModelCost | undefined,
): string {
  if (pricingModel === 'on-demand') {
    return 'Baseline pay-as-you-go cached price.';
  }

  if (!model || model.available !== true) {
    return model?.unavailableReason ?? 'Not available for this SKU/region.';
  }

  if (pricingModel === 'spot') {
    return spotEstimateCaveat(model.caveat);
  }

  return model.caveat ?? 'Commitment scenario based on cached provider pricing terms.';
}

function spotEstimateCaveat(caveat: string | undefined): string {
  const estimateNotice =
    'Spot/preemptible pricing is interruptible and modeled as an estimate, not a guarantee.';

  if (!caveat) {
    return estimateNotice;
  }

  return /estimate|estimated|not a guarantee/i.test(caveat)
    ? caveat
    : `${caveat} ${estimateNotice}`;
}

function calculationText(lineItem: ComparisonLineItem): string {
  if (lineItem.baseHourlyCostUsd !== undefined) {
    return `$${formatNumber(
      lineItem.baseHourlyCostUsd,
    )} hourly x ${HOURS_PER_MONTH} hours = $${formatNumber(lineItem.baseMonthlyCostUsd)} monthly`;
  }

  if (lineItem.unitPriceUsd !== undefined) {
    return `$${formatNumber(lineItem.unitPriceUsd)} per ${lineItem.unit ?? 'unit'} rolled into $${formatNumber(
      lineItem.baseMonthlyCostUsd,
    )} monthly`;
  }

  return `Provider adapter monthly subtotal = $${formatNumber(lineItem.baseMonthlyCostUsd)}`;
}

function pricingModelEvidence(lineItem: ComparisonLineItem): string {
  if (!lineItem.pricingModels || lineItem.pricingModels.length === 0) {
    return 'On-demand only for this line item.';
  }

  return lineItem.pricingModels
    .map((model) =>
      model.available
        ? `${model.model}: $${formatNumber(model.monthlyCostUsd ?? 0)} monthly`
        : `${model.model}: unavailable (${model.unavailableReason ?? 'not offered'})`,
    )
    .join('; ');
}

function componentMonthly(
  provider: ComparisonProviderResult,
  component: NonNullable<ComparisonLineItem['costComponent']>,
): number {
  return provider.lineItems
    .filter((lineItem) => (lineItem.costComponent ?? costComponentForCategory(lineItem.category)) === component)
    .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
}

function computeSpecificationOpportunityRows(result: ComparisonResult): string[][] {
  const computeRequirement = result.requirements?.serviceRequirements.find(
    (requirement) => requirement.serviceCategory === 'compute',
  );

  if (!computeRequirement) {
    return [];
  }

  const tier = computeSpecTierForRequirement(computeRequirement);
  const architecture = computeArchitectureForRequirement(computeRequirement);
  const tenancy = computeTenancyForRequirement(computeRequirement);
  const capacity = computeCapacityForRequirement(computeRequirement);

  return result.providers.flatMap((provider) => {
    const computeMonthly = componentMonthly(provider, 'compute');

    if (computeMonthly <= 0) {
      return [];
    }

    const profile = COMPUTE_SPEC_EVIDENCE[tier][provider.providerId];
    const family = computeSpecFamilyLabel(profile, architecture);
    const monthlySavings = computeArchitectureMonthlyDelta(
      provider.providerId,
      computeMonthly,
      architecture,
    );
    const recommendation = computeSpecRecommendation(
      provider.providerId,
      profile,
      architecture,
      tenancy,
    );

    return [
      [
        'Compute specification',
        `${provider.providerId} ${family} mapping should be validated for vCPU/RAM, network bandwidth, and disk baseline; ${recommendation}`,
        architecture === 'gpu' ? '' : formatNumber(monthlySavings),
        architecture === 'gpu' ? '' : formatNumber(monthlySavings * 12),
        monthlySavings > 100 ? 'High' : monthlySavings > 20 ? 'Medium' : 'Low',
        tenancy === 'shared' ? 'Low' : 'Medium',
        `${provider.providerId} ${profile.useCase} evidence: ${capacity}; network baseline ${profile.networkBaseline}; disk baseline ${profile.diskBaseline}; tenancy ${tenancy}.`,
      ],
    ];
  });
}

function computeSpecTierForRequirement(
  requirement: NonNullable<ComparisonResult['requirements']>['serviceRequirements'][number],
): ComputeSpecTier {
  const params = requirementScaleParams(requirement);
  const tier = String(requirement.tier ?? '').toLowerCase();
  const instanceFamily = String(params.instanceFamily ?? '').toLowerCase();
  const source = tier || instanceFamily;

  switch (source) {
    case 'burstable':
      return 'burstable';
    case 'small':
      return 'small';
    case 'compute':
    case 'compute-optimized':
      return 'compute';
    case 'memory':
    case 'memory-optimized':
      return 'memory';
    case 'storage':
    case 'storage-optimized':
      return 'storage';
    case 'accelerated':
    case 'accelerated-computing':
      return 'accelerated';
    case 'custom':
      return 'custom';
    case 'balanced':
    case 'general-purpose':
    default:
      return 'balanced';
  }
}

function computeArchitectureForRequirement(
  requirement: NonNullable<ComparisonResult['requirements']>['serviceRequirements'][number],
): 'x86_64' | 'arm64' | 'gpu' {
  const architecture = String(requirementScaleParams(requirement).processorArchitecture ?? 'x86_64');

  if (architecture === 'arm64' || architecture === 'gpu') {
    return architecture;
  }

  return 'x86_64';
}

function computeTenancyForRequirement(
  requirement: NonNullable<ComparisonResult['requirements']>['serviceRequirements'][number],
): 'shared' | 'dedicated-host' | 'sole-tenant' {
  const tenancy = String(requirementScaleParams(requirement).tenancy ?? 'shared');

  if (tenancy === 'dedicated-host' || tenancy === 'sole-tenant') {
    return tenancy;
  }

  return 'shared';
}

function computeCapacityForRequirement(
  requirement: NonNullable<ComparisonResult['requirements']>['serviceRequirements'][number],
): string {
  const params = requirementScaleParams(requirement);
  const quantity = Math.max(1, requirement.quantity ?? 1);
  const vcpu =
    numericScaleParam(params, 'vcpu') ||
    numberFromRequirementText(requirement.instanceType, /([\d.]+)\s*vCPU/i);
  const memoryGb =
    numericScaleParam(params, 'memoryGb') ||
    numberFromRequirementText(requirement.instanceType, /([\d.]+)\s*GB/i);

  if (vcpu > 0 && memoryGb > 0) {
    return `${formatNumber(quantity)} node(s), ${formatNumber(vcpu * quantity)} vCPU / ${formatNumber(
      memoryGb * quantity,
    )}GB requested`;
  }

  return requirement.instanceType
    ? `${formatNumber(quantity)} node(s), ${requirement.instanceType}`
    : `${formatNumber(quantity)} compute unit(s) requested`;
}

function computeSpecFamilyLabel(
  profile: ComputeSpecEvidenceProfile,
  architecture: 'x86_64' | 'arm64' | 'gpu',
): string {
  if (architecture === 'gpu') {
    return profile.gpuFamily ?? profile.x86Family;
  }

  return architecture === 'arm64' ? profile.armFamily : profile.x86Family;
}

function computeArchitectureMonthlyDelta(
  providerId: ComparisonProviderResult['providerId'],
  computeMonthly: number,
  architecture: 'x86_64' | 'arm64' | 'gpu',
): number {
  if (architecture === 'gpu') {
    return 0;
  }

  const armFactor = COMPUTE_ARM_COST_FACTORS[providerId];

  if (architecture === 'arm64') {
    return roundCurrency(Math.max(0, computeMonthly / armFactor - computeMonthly));
  }

  return roundCurrency(Math.max(0, computeMonthly - computeMonthly * armFactor));
}

function computeSpecRecommendation(
  providerId: ComparisonProviderResult['providerId'],
  profile: ComputeSpecEvidenceProfile,
  architecture: 'x86_64' | 'arm64' | 'gpu',
  tenancy: 'shared' | 'dedicated-host' | 'sole-tenant',
): string {
  if (architecture === 'gpu') {
    return 'compare accelerator type, quota, CUDA/framework support, and data-staging cost before choosing on list price.';
  }

  if (tenancy !== 'shared') {
    return 'validate dedicated-host or sole-tenant density before accepting the per-instance comparison.';
  }

  if (architecture === 'x86_64') {
    return `evaluate ${profile.armFamily} as an ARM target before locking ${profile.x86Family}.`;
  }

  return `keep ${providerId} x86 fallback sizing in the proposal for packages that are not ARM-ready.`;
}

function requirementScaleParams(
  requirement: NonNullable<ComparisonResult['requirements']>['serviceRequirements'][number],
): Record<string, string | number | boolean> {
  return (requirement.scaleParams ?? {}) as Record<string, string | number | boolean>;
}

function numberFromRequirementText(value: string | undefined, pattern: RegExp): number {
  const match = value?.match(pattern);
  const parsed = match ? Number(match[1]) : 0;

  return Number.isFinite(parsed) ? parsed : 0;
}

function databaseIntelligenceMonthly(provider: ComparisonProviderResult): number {
  return databaseIntelligenceLineItems(provider).reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );
}

function runtimeIntelligenceMonthly(provider: ComparisonProviderResult): number {
  return runtimeIntelligenceLineItems(provider).reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );
}

function operationsIntelligenceMonthly(provider: ComparisonProviderResult): number {
  return operationsIntelligenceLineItems(provider).reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );
}

function databaseIntelligenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'database' ||
      lineItem.costComponent === 'database' ||
      databaseDescription(lineItem.description) ||
      databaseDescription(lineItem.skuId ?? ''),
  );
}

function runtimeIntelligenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter((lineItem) =>
    runtimeDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
}

function operationsIntelligenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter((lineItem) =>
    operationsDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
}

function rightSizingSavingsRate(averageUtilizationPercent?: number): number {
  if (averageUtilizationPercent === undefined) {
    return 0;
  }

  if (averageUtilizationPercent <= 25) {
    return 0.35;
  }

  if (averageUtilizationPercent <= 40) {
    return 0.25;
  }

  if (averageUtilizationPercent <= 55) {
    return 0.15;
  }

  return 0;
}

function architectureRiskOpportunityRows(result: ComparisonResult): string[][] {
  const rows: string[][] = [];

  for (const provider of result.providers) {
    const dataPathMonthly =
      componentMonthly(provider, 'egress') + componentMonthly(provider, 'networking');
    const providerMonthly = provider.totals.monthly;

    if (providerMonthly > 0 && dataPathMonthly / providerMonthly >= 0.35) {
      rows.push([
        'Architecture risk',
        `${provider.providerId} data-transfer line items are ${formatNumber(
          (dataPathMonthly / providerMonthly) * 100,
        )}% of monthly spend; validate CDN, NAT, cross-AZ, and inter-region paths before sign-off.`,
        '',
        '',
        'High',
        'Medium',
        `Egress/networking risk from cached line items: $${formatNumber(
          dataPathMonthly,
        )}/mo of $${formatNumber(providerMonthly)}/mo.`,
      ]);
    }
  }

  for (const requirement of result.requirements?.serviceRequirements ?? []) {
    const scaleParams = requirement.scaleParams ?? {};

    if (requirement.serviceCategory === 'database') {
      const engine = String(scaleParams.engine ?? requirement.serviceType).toLowerCase();
      const ruPerSecond = numericScaleParam(scaleParams, 'ruPerSecond');
      const readUnits = numericScaleParam(scaleParams, 'nosqlReadRequestUnitsMillion');
      const writeUnits = numericScaleParam(scaleParams, 'nosqlWriteRequestUnitsMillion');
      const storageGrowthGb = numericScaleParam(scaleParams, 'storageGrowthGbPerMonth');
      const sizeGb = numericScaleParam(scaleParams, 'sizeGb');
      const replicaTransferGb = numericScaleParam(scaleParams, 'crossRegionReplicaTransferGb');
      const searchNodeCount = numericScaleParam(scaleParams, 'searchNodeCount');
      const searchStorageGb = numericScaleParam(scaleParams, 'searchStorageGb');
      const searchQueriesMillion = numericScaleParam(scaleParams, 'searchQueriesMillion');
      const isNoSql =
        engine.includes('nosql') ||
        engine.includes('mongo') ||
        engine.includes('dynamo') ||
        engine.includes('cosmos') ||
        ruPerSecond > 0 ||
        readUnits + writeUnits > 0;

      if (isNoSql) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} uses NoSQL/RU-style throughput; validate provisioned vs on-demand break-even before production traffic.`,
          '',
          '',
          ruPerSecond >= 4000 || readUnits + writeUnits >= 100 ? 'High' : 'Medium',
          'Medium',
          `Requirement evidence: engine ${engine}, ${formatNumber(
            ruPerSecond,
          )} RU/s, ${formatNumber(readUnits + writeUnits)}M request units/month.`,
        ]);
      }

      if (sizeGb > 0 && storageGrowthGb > 0 && (storageGrowthGb * 12) / sizeGb >= 0.5) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} database storage may grow ${formatNumber(
            (storageGrowthGb * 12 * 100) / sizeGb,
          )}% annually; validate autoscaling, backup retention, and IOPS implications.`,
          '',
          '',
          (storageGrowthGb * 12) / sizeGb >= 1 ? 'High' : 'Medium',
          'Medium',
          `Requirement evidence: ${formatNumber(sizeGb)}GB current size and ${formatNumber(
            storageGrowthGb,
          )}GB/month growth.`,
        ]);
      }

      if (
        requirement.serviceType.includes('search') ||
        searchNodeCount > 0 ||
        searchStorageGb > 0 ||
        searchQueriesMillion > 0
      ) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} has managed-search capacity assumptions; validate replicas, partitions, semantic/query add-ons, and index lifecycle before production indexing.`,
          '',
          '',
          searchNodeCount >= 3 || searchStorageGb >= 500 || searchQueriesMillion >= 50
            ? 'High'
            : 'Medium',
          'Medium',
          `Requirement evidence: ${formatNumber(searchNodeCount)} search nodes, ${formatNumber(
            searchStorageGb,
          )}GB index storage, ${formatNumber(searchQueriesMillion)}M queries/month.`,
        ]);
      }

      if (replicaTransferGb > 0) {
        rows.push([
          'Architecture risk',
          `${requirement.serviceType} includes ${formatNumber(
            replicaTransferGb,
          )}GB/month cross-region replica transfer; validate DR topology and data-transfer rates.`,
          '',
          '',
          replicaTransferGb >= 500 ? 'High' : 'Medium',
          'Medium',
          'Cross-region read replicas can create recurring data-transfer and storage duplication costs.',
        ]);
      }
    }

    if (
      requirement.serviceCategory === 'storage' &&
      String(scaleParams.replication ?? '').toLowerCase() === 'cross-region'
    ) {
      rows.push([
        'Architecture risk',
        `${requirement.serviceType} uses cross-region replication; validate replication transfer and minimum-duration storage charges.`,
        '',
        '',
        'Medium',
        'Medium',
        'Cross-region object/block/file replication can multiply storage and data-transfer spend.',
      ]);
    }
  }

  return rows;
}

interface EgressOptimizationInsight {
  recommendation: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
}

interface StorageOptimizationInsight {
  recommendation: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
  hasAdvancedSignal: boolean;
}

interface DatabaseOptimizationInsight {
  recommendation: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
  hasAdvancedSignal: boolean;
}

interface RuntimeOptimizationInsight {
  recommendation: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
  hasAdvancedSignal: boolean;
}

interface OperationsOptimizationInsight {
  recommendation: string;
  monthlySavings: number;
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
  hasAdvancedSignal: boolean;
}

interface SpotBlendInsight {
  spotPercent: number;
  onDemandPercent: number;
  onDemandMonthly: number;
  spotMonthly: number;
  blendedMonthly: number;
  monthlySavings: number;
  risk: 'Low' | 'Medium' | 'High';
  evidence: string;
}

function spotBlendInsight(
  result: ComparisonResult,
  provider: ComparisonProviderResult,
): SpotBlendInsight | undefined {
  const onDemand = modelCostForProvider(provider, 'on-demand');
  const spot = modelCostForProvider(provider, 'spot');

  if (
    !onDemand.available ||
    !spot.available ||
    onDemand.monthlyCostUsd === undefined ||
    spot.monthlyCostUsd === undefined ||
    spot.monthlyCostUsd >= onDemand.monthlyCostUsd
  ) {
    return undefined;
  }

  const spotPercent = spotBlendPercent(result);
  const spotRate = spotPercent / 100;
  const blendedMonthly = roundCurrency(
    onDemand.monthlyCostUsd * (1 - spotRate) + spot.monthlyCostUsd * spotRate,
  );
  const monthlySavings = roundCurrency(onDemand.monthlyCostUsd - blendedMonthly);

  if (monthlySavings <= 0) {
    return undefined;
  }

  const risk = spotBlendRisk(result, spotPercent, spot.volatility);
  const lowEstimate = roundCurrency(blendedMonthly * 0.94);
  const highEstimate = roundCurrency(blendedMonthly * 1.06);

  return {
    spotPercent,
    onDemandPercent: 100 - spotPercent,
    onDemandMonthly: onDemand.monthlyCostUsd,
    spotMonthly: spot.monthlyCostUsd,
    blendedMonthly,
    monthlySavings,
    risk,
    evidence: `${provider.providerId} on-demand $${formatNumber(
      onDemand.monthlyCostUsd,
    )}/mo vs spot estimate $${formatNumber(
      spot.monthlyCostUsd,
    )}/mo; blended estimate is $${formatNumber(
      blendedMonthly,
    )}/mo (range $${formatNumber(lowEstimate)}-$${formatNumber(
      highEstimate,
    )}/mo) with ${risk.toLowerCase()} interruption risk. ${
      spot.caveat ?? 'Spot is interruptible and must be validated against current market behavior.'
    }`,
  };
}

function spotBlendPercent(result: ComparisonResult): number {
  const environment = result.requirements?.workloadProfile?.environment;
  const usagePattern = result.requirements?.workloadProfile?.usagePattern?.type;

  if (environment === 'production' && usagePattern === 'always_on') {
    return 20;
  }

  if (environment === 'production') {
    return usagePattern === 'bursty' ? 40 : 30;
  }

  if (environment === 'development' || environment === 'test') {
    return usagePattern === 'bursty' ? 60 : 50;
  }

  if (environment === 'staging') {
    return usagePattern === 'bursty' ? 50 : 40;
  }

  return usagePattern === 'bursty' ? 40 : 30;
}

function spotBlendRisk(
  result: ComparisonResult,
  spotPercent: number,
  volatility?: PricingModelCost['volatility'],
): 'Low' | 'Medium' | 'High' {
  const environment = result.requirements?.workloadProfile?.environment;

  if (environment === 'production' && spotPercent >= 40) {
    return 'High';
  }

  if (volatility === 'volatile' || spotPercent >= 50) {
    return 'High';
  }

  if (spotPercent >= 30 || environment === 'production') {
    return 'Medium';
  }

  return 'Low';
}

function storageOptimizationInsight(
  provider: ComparisonProviderResult,
): StorageOptimizationInsight | undefined {
  const storageMonthly = componentMonthly(provider, 'storage');

  if (storageMonthly <= 0) {
    return undefined;
  }

  const storageRows = provider.lineItems
    .filter(
      (lineItem) =>
        lineItem.category === 'storage' ||
        lineItem.costComponent === 'storage' ||
        storageDescription(lineItem.description) ||
        storageDescription(lineItem.skuId ?? ''),
    )
    .sort((left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd);

  if (storageRows.length === 0) {
    return undefined;
  }

  const advancedRows = storageRows.filter((lineItem) =>
    storageAdvancedDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
  const primary = advancedRows[0] ?? storageRows[0];
  const primaryMonthly = primary.baseMonthlyCostUsd || storageMonthly;
  const primaryDescription = primary.description;
  const normalizedPrimary = `${primary.skuId ?? ''} ${primaryDescription}`.toLowerCase();

  if (normalizedPrimary.includes('snapshot')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      recommendation:
        'tune snapshot retention and deduplicate backup copies before approving the storage run-rate.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; retention pruning is modeled as a 30% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('minimum-duration')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'align lifecycle timing with cold/archive billable minimums before approving the storage run-rate.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; minimum-duration timing cleanup is modeled at 20% of that row.`,
    };
  }

  if (normalizedPrimary.includes('retrieval') || normalizedPrimary.includes('archive')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'validate archive retrieval frequency and split warm/cold tiers before moving data deeper into archive.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; retrieval and archive-tier tuning is modeled at 25% of that row.`,
    };
  }

  if (normalizedPrimary.includes('replication')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      recommendation:
        'validate same-region vs cross-region replication policy against the actual DR requirement.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; replication policy review is modeled as a 35% reduction of that row.`,
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
      recommendation:
        'right-size provisioned IOPS, throughput, and multi-attach placement after measuring baseline latency and failover needs.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; performance right-sizing is modeled at 25% of that row.`,
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
      recommendation:
        'batch object operations, reduce LIST-heavy access patterns, and validate monitored object count before scaling request volume.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; request-shape optimization is modeled at 20% of that row.`,
    };
  }

  if (normalizedPrimary.includes('lifecycle')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      recommendation:
        'validate lifecycle transition frequency, minimum-duration rules, and tiering break-even before proposal sign-off.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant storage row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; lifecycle-rule cleanup is modeled at 15% of that row.`,
    };
  }

  const monthlySavings = roundCurrency(storageMonthly * 0.15);

  return {
    recommendation:
      'review storage class, lifecycle policy, and growth assumptions before committing to the baseline tier.',
    monthlySavings,
    effort: 'Low',
    hasAdvancedSignal: false,
    evidence: `${provider.providerId} storage baseline is $${formatNumber(
      storageMonthly,
    )}/mo across ${storageRows.length} storage row(s); tiering review is modeled at 15% of storage spend.`,
  };
}

function storageAnatomyOpportunityRows(result: ComparisonResult): string[][] {
  const storageRequirement = result.requirements?.serviceRequirements.find(
    (requirement) => requirement.serviceCategory === 'storage',
  );
  const databaseRequirement = result.requirements?.serviceRequirements.find(
    (requirement) => requirement.serviceCategory === 'database',
  );

  if (!storageRequirement && !databaseRequirement) {
    return [];
  }

  const storageParams = storageRequirement ? requirementScaleParams(storageRequirement) : {};
  const databaseParams = databaseRequirement ? requirementScaleParams(databaseRequirement) : {};
  const storageClass = String(
    storageParams.storageClass ?? storageRequirement?.tier ?? storageRequirement?.instanceType ?? 'standard',
  ).replace(/-/g, ' ');
  const requestThousands =
    numericScaleParam(storageParams, 'monthlyPutRequestsThousand') +
    numericScaleParam(storageParams, 'monthlyGetRequestsThousand') +
    numericScaleParam(storageParams, 'monthlyDeleteRequestsThousand') +
    numericScaleParam(storageParams, 'monthlyListRequestsThousand');
  const retrievalGb = numericScaleParam(storageParams, 'monthlyRetrievalGb');
  const replication = String(storageParams.replication ?? 'none');
  const lifecycleTransitions = numericScaleParam(storageParams, 'lifecycleTransitionsThousand');
  const snapshotSizeGb = numericScaleParam(storageParams, 'snapshotSizeGb');
  const snapshotRetentionDays = numericScaleParam(storageParams, 'snapshotRetentionDays');
  const provisionedIops = numericScaleParam(storageParams, 'provisionedIops');
  const databaseGrowthGb = numericScaleParam(databaseParams, 'storageGrowthGbPerMonth');
  const databaseSizeGb =
    numericScaleParam(databaseParams, 'databaseSizeGb') || numericScaleParam(databaseParams, 'sizeGb');
  const annualDatabaseGrowthPercent =
    databaseSizeGb > 0 ? (databaseGrowthGb * 12 * 100) / databaseSizeGb : 0;

  return result.providers.flatMap((provider) => {
    const storageRows = storageEvidenceLineItems(provider);
    const databaseStorageRows = databaseStorageEvidenceLineItems(provider);
    const rows = [...storageRows, ...databaseStorageRows];

    if (rows.length === 0) {
      return [];
    }

    const dimensions = storageAnatomyDimensions(rows);
    const monthly = rows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const dimensionSummary = storageAnatomyDimensionSummary(dimensions);
    const action = storageAnatomyReportAction(dimensions, {
      databaseGrowthGb,
      lifecycleTransitions,
      provisionedIops,
      requestThousands,
      retrievalGb,
      snapshotSizeGb,
      replication,
    });
    const operationsEvidence =
      requestThousands > 0 || retrievalGb > 0
        ? `${formatNumber(requestThousands)}K operations and ${formatNumber(retrievalGb)}GB retrieval configured`
        : 'request/retrieval dimensions not configured';
    const resilienceEvidence = [
      replication !== 'none' ? `${replication.replace('-', ' ')} replication` : undefined,
      snapshotSizeGb > 0
        ? `${formatNumber(snapshotSizeGb)}GB snapshots for ${formatNumber(snapshotRetentionDays)} days`
        : undefined,
      lifecycleTransitions > 0
        ? `${formatNumber(lifecycleTransitions)}K lifecycle transitions/month`
        : undefined,
    ].filter(Boolean);
    const performanceEvidence = [
      provisionedIops > 0 ? `${formatNumber(provisionedIops)} provisioned IOPS` : undefined,
      databaseGrowthGb > 0
        ? `${formatNumber(databaseGrowthGb)}GB/month database growth (${formatNumber(
            annualDatabaseGrowthPercent,
          )}% annualized)`
        : undefined,
    ].filter(Boolean);

    return [
      [
        'Storage anatomy',
        `${provider.providerId} storage class/type review: ${storageClass}; ${action}`,
        '',
        '',
        monthly > 100 ? 'High' : monthly > 25 ? 'Medium' : 'Low',
        'Low',
        `${provider.providerId} storage-related run-rate is $${formatNumber(
          monthly,
        )}/mo across ${rows.length} row(s): ${dimensionSummary}. ${operationsEvidence}. ${
          resilienceEvidence.length ? resilienceEvidence.join('; ') : 'no replication/snapshot/lifecycle signal'
        }. ${performanceEvidence.length ? performanceEvidence.join('; ') : 'baseline performance only'}.`,
      ],
    ];
  });
}

function storageEvidenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'storage' ||
      lineItem.costComponent === 'storage' ||
      storageDescription(lineItem.description) ||
      storageDescription(lineItem.skuId ?? ''),
  );
}

function databaseStorageEvidenceLineItems(provider: ComparisonProviderResult): ComparisonLineItem[] {
  return provider.lineItems.filter(
    (lineItem) =>
      lineItem.category === 'database' &&
      ['storage', 'backup', 'growth', 'iops', 'replica transfer', 'replication'].some((needle) =>
        `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase().includes(needle),
      ),
  );
}

function storageAnatomyDimensions(
  lineItems: ComparisonLineItem[],
): Record<'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance', number> {
  return lineItems.reduce(
    (totals, lineItem) => {
      const normalized = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();
      const monthly = lineItem.baseMonthlyCostUsd;

      if (normalized.includes('snapshot') || normalized.includes('backup')) {
        totals.snapshot += monthly;
      } else if (normalized.includes('retrieval') || normalized.includes('rehydrat')) {
        totals.retrieval += monthly;
      } else if (normalized.includes('replication') || normalized.includes('replica transfer')) {
        totals.replication += monthly;
      } else if (
        normalized.includes('lifecycle') ||
        normalized.includes('transition') ||
        normalized.includes('minimum-duration')
      ) {
        totals.lifecycle += monthly;
      } else if (
        normalized.includes('iops') ||
        normalized.includes('throughput') ||
        normalized.includes('performance') ||
        normalized.includes('multi-attach')
      ) {
        totals.performance += monthly;
      } else if (
        normalized.includes('operation') ||
        normalized.includes('request') ||
        normalized.includes('monitoring') ||
        normalized.includes('put') ||
        normalized.includes('get') ||
        normalized.includes('list') ||
        normalized.includes('delete')
      ) {
        totals.operations += monthly;
      } else {
        totals.base += monthly;
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

function storageAnatomyDimensionSummary(
  dimensions: Record<
    'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance',
    number
  >,
): string {
  return Object.entries(dimensions)
    .filter(([, value]) => value > 0.005)
    .map(([key, value]) => `${key} $${formatNumber(value)}/mo`)
    .join(', ');
}

function storageAnatomyReportAction(
  dimensions: Record<
    'base' | 'operations' | 'retrieval' | 'replication' | 'lifecycle' | 'snapshot' | 'performance',
    number
  >,
  signals: {
    databaseGrowthGb: number;
    lifecycleTransitions: number;
    provisionedIops: number;
    requestThousands: number;
    retrievalGb: number;
    snapshotSizeGb: number;
    replication: string;
  },
): string {
  const dominant = Object.entries(dimensions).sort((left, right) => right[1] - left[1])[0]?.[0];

  if (dominant === 'snapshot' || signals.snapshotSizeGb > 0) {
    return 'validate snapshot retention and older-copy tiering before final quote.';
  }

  if (dominant === 'retrieval' || signals.retrievalGb > 0) {
    return 'validate retrieval frequency, rehydration windows, and warm/cold split.';
  }

  if (dominant === 'replication' || signals.replication !== 'none') {
    return 'confirm same-region versus cross-region replication against the DR target.';
  }

  if (dominant === 'performance' || signals.provisionedIops > 0) {
    return 'compare provisioned IOPS and throughput against measured latency needs.';
  }

  if (dominant === 'operations' || signals.requestThousands > 0) {
    return 'batch request-heavy workflows and reduce LIST-heavy paths.';
  }

  if (dominant === 'lifecycle' || signals.lifecycleTransitions > 0) {
    return 'validate lifecycle transition frequency and minimum-duration break-even.';
  }

  if (signals.databaseGrowthGb > 0) {
    return 'model database storage autoscaling and backup growth.';
  }

  return 'validate storage class, minimum-duration rules, and access pattern.';
}

function databaseOptimizationInsight(
  provider: ComparisonProviderResult,
): DatabaseOptimizationInsight | undefined {
  const databaseRows = databaseIntelligenceLineItems(provider).sort(
    (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
  );
  const databaseMonthly = databaseRows.reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );

  if (databaseMonthly <= 0 || databaseRows.length === 0) {
    return undefined;
  }

  const advancedRows = databaseRows.filter((lineItem) =>
    databaseAdvancedDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
  const primary = advancedRows[0] ?? databaseRows[0];
  const primaryMonthly = primary.baseMonthlyCostUsd || databaseMonthly;
  const primaryDescription = primary.description;
  const normalizedPrimary = `${primary.skuId ?? ''} ${primaryDescription}`.toLowerCase();

  if (normalizedPrimary.includes('ru') || normalizedPrimary.includes('cosmos')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'validate RU/s utilization, autoscale limits, and serverless/provisioned break-even before production traffic.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; RU/s right-sizing is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('nosql') || normalizedPrimary.includes('read unit') || normalizedPrimary.includes('write unit')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'model on-demand vs provisioned NoSQL capacity and write-heavy partition design before choosing the default pricing mode.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; NoSQL capacity-mode tuning is modeled as a 20% reduction of that row.`,
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
      recommendation:
        'right-size search replicas, partitions, index lifecycle, and query capacity before scaling managed-search clusters.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; managed-search tuning is modeled as a 22% reduction of that row.`,
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
      recommendation:
        'separate storage from query compute, partition hot datasets, and compare on-demand query spend with committed warehouse capacity.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; warehouse/query tuning is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('iops') || normalizedPrimary.includes('performance')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'right-size provisioned database IOPS after measuring storage latency, queue depth, and peak transaction windows.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; database IOPS right-sizing is modeled as a 25% reduction of that row.`,
    };
  }

  if (
    normalizedPrimary.includes('replica') ||
    normalizedPrimary.includes('standby') ||
    normalizedPrimary.includes('multi-az')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'validate read-replica count, standby policy, and read-routing targets against actual RPO/RTO and read scaling needs.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; replica and standby review is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('backup') || normalizedPrimary.includes('growth')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'tune backup retention, storage autoscaling thresholds, and archive policy before database growth compounds.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; backup/growth policy tuning is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('cache') || normalizedPrimary.includes('redis')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'right-size cache replicas, TTL policy, and failover topology before scaling managed Redis capacity.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant database row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; cache topology tuning is modeled as a 20% reduction of that row.`,
    };
  }

  const monthlySavings = roundCurrency(databaseMonthly * 0.15);

  return {
    recommendation:
      'review managed database tier, storage growth, HA posture, and query profile before committing to the baseline.',
    monthlySavings,
    effort: 'Low',
    hasAdvancedSignal: false,
    evidence: `${provider.providerId} database baseline is $${formatNumber(
      databaseMonthly,
    )}/mo across ${databaseRows.length} database/analytics row(s); tier review is modeled at 15% of spend.`,
  };
}

function databaseAnatomyOpportunityRows(result: ComparisonResult): string[][] {
  const databaseRequirement = result.requirements?.serviceRequirements.find(
    (requirement) => requirement.serviceCategory === 'database',
  );

  if (!databaseRequirement) {
    return [];
  }

  const params = requirementScaleParams(databaseRequirement);
  const engine = String(params.databaseEngine ?? params.engine ?? databaseRequirement.serviceType);
  const sizeGb = numericScaleParam(params, 'databaseSizeGb') || numericScaleParam(params, 'sizeGb');
  const backupGb = numericScaleParam(params, 'backupStorageGb');
  const backupDays = numericScaleParam(params, 'backupRetentionDays');
  const provisionedIops = numericScaleParam(params, 'provisionedIops');
  const readReplicas = numericScaleParam(params, 'readReplicaCount');
  const replicaTransferGb = numericScaleParam(params, 'crossRegionReplicaTransferGb');
  const readUnits = numericScaleParam(params, 'nosqlReadRequestUnitsMillion');
  const writeUnits = numericScaleParam(params, 'nosqlWriteRequestUnitsMillion');
  const ruPerSecond = numericScaleParam(params, 'ruPerSecond');
  const queryDataTb = numericScaleParam(params, 'queryDataTb');
  const cacheReplicas = numericScaleParam(params, 'cacheReplicaCount');
  const storageGrowthGb = numericScaleParam(params, 'storageGrowthGbPerMonth');
  const searchNodeCount = numericScaleParam(params, 'searchNodeCount');
  const searchStorageGb = numericScaleParam(params, 'searchStorageGb');
  const searchQueriesMillion = numericScaleParam(params, 'searchQueriesMillion');
  const annualGrowthPercent = sizeGb > 0 ? (storageGrowthGb * 12 * 100) / sizeGb : 0;

  return result.providers.flatMap((provider) => {
    const rows = databaseIntelligenceLineItems(provider);

    if (rows.length === 0) {
      return [];
    }

    const dimensions = databaseAnatomyDimensions(rows);
    const monthly = rows.reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0);
    const action = databaseAnatomyReportAction(dimensions, {
      cacheReplicas,
      provisionedIops,
      queryDataTb,
      readReplicas,
      ruPerSecond,
      searchNodeCount,
      storageGrowthGb,
    });
    const capacityEvidence = [
      ruPerSecond > 0 ? `${formatNumber(ruPerSecond)} RU/s` : undefined,
      readUnits + writeUnits > 0
        ? `${formatNumber(readUnits)}M reads and ${formatNumber(writeUnits)}M writes`
        : undefined,
    ].filter(Boolean);
    const resilienceEvidence = [
      backupGb > 0 ? `${formatNumber(backupGb)}GB backup for ${formatNumber(backupDays)} days` : undefined,
      readReplicas > 0 || replicaTransferGb > 0
        ? `${formatNumber(readReplicas)} replicas and ${formatNumber(replicaTransferGb)}GB transfer`
        : undefined,
      provisionedIops > 0 ? `${formatNumber(provisionedIops)} provisioned IOPS` : undefined,
      storageGrowthGb > 0
        ? `${formatNumber(storageGrowthGb)}GB/month growth (${formatNumber(
            annualGrowthPercent,
          )}% annualized)`
        : undefined,
    ].filter(Boolean);
    const analyticsEvidence = [
      queryDataTb > 0 ? `${formatNumber(queryDataTb)}TB query processing` : undefined,
      cacheReplicas > 0 ? `${formatNumber(cacheReplicas)} cache replicas` : undefined,
      searchNodeCount + searchStorageGb + searchQueriesMillion > 0
        ? `${formatNumber(searchNodeCount)} search nodes, ${formatNumber(
            searchStorageGb,
          )}GB index, ${formatNumber(searchQueriesMillion)}M queries`
        : undefined,
    ].filter(Boolean);

    return [
      [
        'Database anatomy',
        `${provider.providerId} ${engine} capacity review; ${action}`,
        '',
        '',
        monthly > 100 ? 'High' : monthly > 25 ? 'Medium' : 'Low',
        'Medium',
        `${provider.providerId} database-related run-rate is $${formatNumber(
          monthly,
        )}/mo across ${rows.length} row(s): ${databaseAnatomyDimensionSummary(dimensions)}. ${
          capacityEvidence.length ? capacityEvidence.join('; ') : 'capacity-mode dimensions not configured'
        }. ${resilienceEvidence.length ? resilienceEvidence.join('; ') : 'no backup/replica/IOPS signal'}. ${
          analyticsEvidence.length ? analyticsEvidence.join('; ') : 'no cache/warehouse/search signal'
        }.`,
      ],
    ];
  });
}

function databaseAnatomyDimensions(
  lineItems: ComparisonLineItem[],
): Record<
  'base' | 'nosql' | 'ru' | 'query' | 'warehouse' | 'search' | 'cache' | 'backup' | 'replica' | 'performance',
  number
> {
  return lineItems.reduce(
    (totals, lineItem) => {
      const normalized = `${lineItem.skuId ?? ''} ${lineItem.description}`.toLowerCase();
      const monthly = lineItem.baseMonthlyCostUsd;

      if (normalized.includes('ru') || normalized.includes('cosmos')) {
        totals.ru += monthly;
      } else if (
        normalized.includes('nosql') ||
        normalized.includes('read unit') ||
        normalized.includes('write unit')
      ) {
        totals.nosql += monthly;
      } else if (
        normalized.includes('search') ||
        normalized.includes('opensearch') ||
        normalized.includes('cognitive search') ||
        normalized.includes('azure ai search') ||
        normalized.includes('cloud search') ||
        normalized.includes('vertex ai search')
      ) {
        totals.search += monthly;
      } else if (
        normalized.includes('warehouse') ||
        normalized.includes('bigquery') ||
        normalized.includes('redshift') ||
        normalized.includes('synapse')
      ) {
        totals.warehouse += monthly;
      } else if (normalized.includes('query')) {
        totals.query += monthly;
      } else if (normalized.includes('cache') || normalized.includes('redis')) {
        totals.cache += monthly;
      } else if (normalized.includes('backup') || normalized.includes('growth')) {
        totals.backup += monthly;
      } else if (
        normalized.includes('replica') ||
        normalized.includes('standby') ||
        normalized.includes('multi-az')
      ) {
        totals.replica += monthly;
      } else if (normalized.includes('iops') || normalized.includes('performance')) {
        totals.performance += monthly;
      } else {
        totals.base += monthly;
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

function databaseAnatomyDimensionSummary(
  dimensions: Record<
    'base' | 'nosql' | 'ru' | 'query' | 'warehouse' | 'search' | 'cache' | 'backup' | 'replica' | 'performance',
    number
  >,
): string {
  return Object.entries(dimensions)
    .filter(([, value]) => value > 0.005)
    .map(([key, value]) => `${key} $${formatNumber(value)}/mo`)
    .join(', ');
}

function databaseAnatomyReportAction(
  dimensions: Record<
    'base' | 'nosql' | 'ru' | 'query' | 'warehouse' | 'search' | 'cache' | 'backup' | 'replica' | 'performance',
    number
  >,
  signals: {
    cacheReplicas: number;
    provisionedIops: number;
    queryDataTb: number;
    readReplicas: number;
    ruPerSecond: number;
    searchNodeCount: number;
    storageGrowthGb: number;
  },
): string {
  const dominant = Object.entries(dimensions).sort((left, right) => right[1] - left[1])[0]?.[0];

  if (dominant === 'ru' || signals.ruPerSecond > 0) {
    return 'validate RU/s utilization, autoscale bounds, and serverless break-even.';
  }

  if (dominant === 'nosql') {
    return 'compare on-demand and provisioned NoSQL capacity before choosing mode.';
  }

  if (dominant === 'query' || dominant === 'warehouse' || signals.queryDataTb > 0) {
    return 'separate warehouse storage from query compute and compare committed capacity.';
  }

  if (dominant === 'search' || signals.searchNodeCount > 0) {
    return 'right-size search replicas, partitions, and index lifecycle before scaling.';
  }

  if (dominant === 'cache' || signals.cacheReplicas > 0) {
    return 'validate cache replica count, TTL policy, and failover topology.';
  }

  if (dominant === 'replica' || signals.readReplicas > 0) {
    return 'confirm read-replica count and standby topology against RPO/RTO.';
  }

  if (dominant === 'performance' || signals.provisionedIops > 0) {
    return 'tune provisioned IOPS using observed latency and transaction peaks.';
  }

  if (dominant === 'backup' || signals.storageGrowthGb > 0) {
    return 'model backup retention and database storage autoscaling before commitment.';
  }

  return 'validate managed tier, engine limits, storage growth, and query profile.';
}

function runtimeOptimizationInsight(
  provider: ComparisonProviderResult,
): RuntimeOptimizationInsight | undefined {
  const runtimeRows = runtimeIntelligenceLineItems(provider).sort(
    (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
  );
  const runtimeMonthly = runtimeRows.reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );

  if (runtimeMonthly <= 0 || runtimeRows.length === 0) {
    return undefined;
  }

  const advancedRows = runtimeRows.filter((lineItem) =>
    runtimeAdvancedDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
  const primary = advancedRows[0] ?? runtimeRows[0];
  const primaryMonthly = primary.baseMonthlyCostUsd || runtimeMonthly;
  const primaryDescription = primary.description;
  const normalizedPrimary = `${primary.skuId ?? ''} ${primaryDescription}`.toLowerCase();

  if (normalizedPrimary.includes('app platform')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'compare request-based scale-to-zero with always-on/provisioned app capacity before selecting the app-hosting posture.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; app-platform posture review is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('gb-second') || normalizedPrimary.includes('duration')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'tune function memory-duration settings and compare functions with always-on containers for steady traffic.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; function runtime tuning is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('request') || normalizedPrimary.includes('invocation')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'batch event triggers, reduce retry noise, and reserve provisioned concurrency only for latency-critical paths.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; invocation-shape tuning is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('control plane')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      recommendation:
        'validate cluster count and shared platform model before accepting per-cluster Kubernetes overhead.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; cluster consolidation review is modeled as a 30% reduction of that row.`,
    };
  }

  if (
    normalizedPrimary.includes('node overhead') ||
    normalizedPrimary.includes('kubernetes node') ||
    normalizedPrimary.includes('networking/operations')
  ) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'right-size worker nodes and autoscaling, or compare managed serverless containers for smaller services.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; node overhead tuning is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('registry egress')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      recommendation:
        'keep image pulls regional, use pull-through cache, and avoid cross-region registry transfer.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; registry locality review is modeled as a 35% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('registry storage')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      recommendation: 'enforce image lifecycle retention for old tags, digests, and build caches.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant runtime row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; registry cleanup is modeled as a 30% reduction of that row.`,
    };
  }

  const monthlySavings = roundCurrency(runtimeMonthly * 0.15);

  return {
    recommendation:
      'review function, container, and orchestration fit against workload traffic shape before standardizing the platform.',
    monthlySavings,
    effort: 'Medium',
    hasAdvancedSignal: false,
    evidence: `${provider.providerId} runtime baseline is $${formatNumber(
      runtimeMonthly,
    )}/mo across ${runtimeRows.length} serverless/container row(s); platform-fit review is modeled at 15% of spend.`,
  };
}

function appPlatformModelAssumptions(result: ComparisonResult): {
  alwaysOnHours: number;
  durationMs: number;
  hasRequirement: boolean;
  memoryGb: number;
  minInstances: number;
  requestsMillion: number;
  vcpu: number;
} {
  const requirements = result.requirements?.serviceRequirements ?? [];
  const appRequirements = requirements.filter(
    (requirement) => requirement.serviceType === 'app-platform',
  );

  return {
    alwaysOnHours:
      maxRequirementScaleParam(appRequirements, 'appPlatformAlwaysOnHours') || HOURS_PER_MONTH,
    durationMs: maxRequirementScaleParam(appRequirements, 'appPlatformRequestDurationMs') || 400,
    hasRequirement: appRequirements.length > 0,
    memoryGb: maxRequirementScaleParam(appRequirements, 'appPlatformMemoryGb') || 0.5,
    minInstances: maxRequirementScaleParam(appRequirements, 'appPlatformMinInstances') || 1,
    requestsMillion: maxRequirementScaleParam(appRequirements, 'appPlatformRequestsMillion'),
    vcpu: maxRequirementScaleParam(appRequirements, 'appPlatformVcpu') || 1,
  };
}

function maxRequirementScaleParam(
  requirements: NonNullable<ComparisonResult['requirements']>['serviceRequirements'],
  key: string,
): number {
  return Math.max(
    0,
    ...requirements.map((requirement) => numericScaleParam(requirement.scaleParams ?? {}, key)),
  );
}

function serverlessMemoryCurveAssumptions(result: ComparisonResult): {
  durationMs: number;
  memoryMb: number;
  requestsMillion: number;
} {
  const requirements = result.requirements?.serviceRequirements ?? [];
  const functionRequirements = requirements.filter(
    (requirement) => requirement.serviceType === 'serverless-functions',
  );

  return {
    durationMs: maxRequirementScaleParam(functionRequirements, 'functionDurationMs') || 100,
    memoryMb: maxRequirementScaleParam(functionRequirements, 'functionMemoryMb') || 512,
    requestsMillion: maxRequirementScaleParam(functionRequirements, 'functionInvocationsMillion'),
  };
}

function serverlessFunctionMonthly(
  providerId: ComparisonProviderResult['providerId'],
  input: {
    durationMs: number;
    memoryMb: number;
    requestsMillion: number;
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

function appPlatformRequestLineMonthly(provider: ComparisonProviderResult): number {
  return roundCurrency(
    provider.lineItems
      .filter((lineItem) => lineItem.skuId?.startsWith('modeled-app-platform-request'))
      .reduce((sum, lineItem) => sum + lineItem.baseMonthlyCostUsd, 0),
  );
}

function appPlatformRequestMonthly(
  providerId: ComparisonProviderResult['providerId'],
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

function appPlatformAlwaysOnMonthly(
  providerId: ComparisonProviderResult['providerId'],
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

function operationsOptimizationInsight(
  provider: ComparisonProviderResult,
): OperationsOptimizationInsight | undefined {
  const operationsRows = operationsIntelligenceLineItems(provider).sort(
    (left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd,
  );
  const operationsMonthly = operationsRows.reduce(
    (sum, lineItem) => sum + lineItem.baseMonthlyCostUsd,
    0,
  );

  if (operationsMonthly <= 0 || operationsRows.length === 0) {
    return undefined;
  }

  const advancedRows = operationsRows.filter((lineItem) =>
    operationsAdvancedDescription(`${lineItem.skuId ?? ''} ${lineItem.description}`),
  );
  const primary = advancedRows[0] ?? operationsRows[0];
  const primaryMonthly = primary.baseMonthlyCostUsd || operationsMonthly;
  const primaryDescription = primary.description;
  const normalizedPrimary = `${primary.skuId ?? ''} ${primaryDescription}`.toLowerCase();

  if (normalizedPrimary.includes('log ingestion')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      recommendation:
        'filter debug noise at source, sample high-volume streams, and route low-value logs to cheaper retention.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; log filtering is modeled as a 30% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('log retention')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.35);

    return {
      recommendation:
        'shorten hot log retention, export compliance logs to archive storage, and delete duplicate streams.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; retention policy tuning is modeled as a 35% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('metric')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'reduce high-cardinality metric labels and aggregate custom metrics before they multiply across services.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; metric cardinality cleanup is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('trace')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.3);

    return {
      recommendation:
        'sample traces by route and error rate instead of retaining every successful request path.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; trace sampling is modeled as a 30% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('secret api')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'cache secrets safely inside runtime boundaries and remove polling loops that re-read unchanged values.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; secret call reduction is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('secret')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      recommendation:
        'retire stale secrets, consolidate duplicate environment keys, and tie rotation policy to ownership tags.',
      monthlySavings,
      effort: 'Low',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; secret inventory cleanup is modeled as a 15% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('ddos')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.15);

    return {
      recommendation:
        'validate which public endpoints truly need advanced DDoS protection versus baseline provider protection.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; protection-scope review is modeled as a 15% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('waf request')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.25);

    return {
      recommendation:
        'scope WAF inspection to exposed paths and tune managed rules before every request pays inspection cost.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; WAF request tuning is modeled as a 25% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('waf')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'remove duplicate WAF rules and consolidate web ACLs around shared managed rule groups.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; WAF rule review is modeled as a 20% reduction of that row.`,
    };
  }

  if (normalizedPrimary.includes('security posture') || normalizedPrimary.includes('finding')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.2);

    return {
      recommendation:
        'scope posture scanning to production assets first and suppress duplicate low-value findings.',
      monthlySavings,
      effort: 'Medium',
      hasAdvancedSignal: true,
      evidence: `${provider.providerId} dominant operations row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; security scope review is modeled as a 20% reduction of that row.`,
    };
  }

  const monthlySavings = roundCurrency(operationsMonthly * 0.15);

  return {
    recommendation:
      'review monitoring, logging, secrets, and security controls as explicit production cost centers.',
    monthlySavings,
    effort: 'Medium',
    hasAdvancedSignal: false,
    evidence: `${provider.providerId} operations baseline is $${formatNumber(
      operationsMonthly,
    )}/mo across ${operationsRows.length} observability/security row(s); service-footprint review is modeled at 15% of spend.`,
  };
}

function egressOptimizationInsight(provider: ComparisonProviderResult): EgressOptimizationInsight {
  const egressMonthly = componentMonthly(provider, 'egress');
  const networkingMonthly = componentMonthly(provider, 'networking');
  const dataPathMonthly = egressMonthly + networkingMonthly;
  const egressRows = provider.lineItems
    .filter(
      (lineItem) =>
        lineItem.category === 'network' ||
        lineItem.costComponent === 'egress' ||
        networkDescription(lineItem.description),
    )
    .sort((left, right) => right.baseMonthlyCostUsd - left.baseMonthlyCostUsd);
  const primary = egressRows[0];
  const primaryMonthly = primary?.baseMonthlyCostUsd ?? egressMonthly;
  const primaryDescription = primary?.description ?? 'egress baseline';
  const normalizedPrimary = `${primary?.skuId ?? ''} ${primaryDescription}`.toLowerCase();
  const tieredGb = egressRows.reduce(
    (sum, lineItem) =>
      sum +
      (lineItem.egressTiers?.reduce((tierSum, tier) => tierSum + tier.billableGb, 0) ?? 0),
    0,
  );
  const cacheHit = parseCacheHitPercent(primaryDescription);
  const originMissGb = parseOriginMissGb(primaryDescription);

  if (normalizedPrimary.includes('cdn')) {
    const targetCacheHit = 95;
    const cacheGap = cacheHit !== undefined ? Math.max(0, targetCacheHit - cacheHit) : 10;
    const savingsRate = clampRatio(cacheGap / 100, 0.05, 0.2);
    const monthlySavings = roundCurrency(primaryMonthly * savingsRate);

    return {
      recommendation:
        cacheHit !== undefined
          ? `raise CDN cache hit from ${formatNumber(cacheHit)}% toward ${targetCacheHit}% before scaling origin capacity.`
          : 'tune CDN cache policy and origin paths before scaling direct egress.',
      monthlySavings,
      effort: 'Low',
      evidence: `${provider.providerId} largest network row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo${
        originMissGb !== undefined ? ` with ${formatNumber(originMissGb)}GB origin miss` : ''
      }; cache-hit tuning opportunity modeled at $${formatNumber(monthlySavings)}/mo.`,
    };
  }

  if (normalizedPrimary.includes('nat')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.4);

    return {
      recommendation:
        'reduce NAT hairpin traffic with private endpoints, gateway endpoints, or route-table review.',
      monthlySavings,
      effort: 'Medium',
      evidence: `${provider.providerId} largest network row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; private endpoint routing is modeled as a 40% reduction of that NAT baseline.`,
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

    return {
      recommendation:
        'validate port speed, redundancy, metered-vs-unlimited transfer, and VPN-to-private-circuit break-even before final network design.',
      monthlySavings,
      effort: 'High',
      evidence: `${provider.providerId} largest network row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; private-connectivity architecture review is modeled as a 25% reduction of that baseline.`,
    };
  }

  if (normalizedPrimary.includes('cross-az') || normalizedPrimary.includes('inter-region')) {
    const monthlySavings = roundCurrency(primaryMonthly * 0.5);

    return {
      recommendation:
        'keep chatty services in the same AZ/region or redesign replication paths before HA sign-off.',
      monthlySavings,
      effort: 'Medium',
      evidence: `${provider.providerId} largest network row is "${primaryDescription}" at $${formatNumber(
        primaryMonthly,
      )}/mo; locality review models a 50% reduction of that transfer path.`,
    };
  }

  if (tieredGb >= 10_240 || dataPathMonthly >= 1000) {
    const monthlySavings = roundCurrency(dataPathMonthly * 0.25);

    return {
      recommendation:
        'evaluate private connectivity, CDN commitments, and same-region data access for high-volume egress.',
      monthlySavings,
      effort: 'High',
      evidence: `${provider.providerId} has $${formatNumber(
        dataPathMonthly,
      )}/mo egress/network exposure${
        tieredGb > 0 ? ` across ${formatNumber(tieredGb)}GB of tier-traced data-out` : ''
      }; high-volume optimization is modeled at 25% of the data-path baseline.`,
    };
  }

  const monthlySavings = roundCurrency(dataPathMonthly * 0.3);

  return {
    recommendation: 'evaluate CDN offload, cache-control, and same-region data access.',
    monthlySavings,
    effort: 'Medium',
    evidence: `${provider.providerId} egress/network baseline is $${formatNumber(
      dataPathMonthly,
    )}/mo; rule-based reduction is 30% when no single network driver dominates.`,
  };
}

function parseCacheHitPercent(description: string): number | undefined {
  const match = description.match(/(\d+(?:\.\d+)?)%\s*cache hit/i);
  const parsed = match ? Number(match[1]) : undefined;

  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function parseOriginMissGb(description: string): number | undefined {
  const match = description.match(/([\d,.]+)\s*GB\s*origin miss/i);
  const parsed = match ? Number(match[1].replace(/,/g, '')) : undefined;

  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function commitmentPreferencePercent(result: ComparisonResult): number {
  const percent = result.requirements?.workloadProfile?.commitmentPreferencePercent;

  if (percent === undefined || !Number.isFinite(percent)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(percent)));
}

function numericScaleParam(params: Record<string, string | number | boolean>, key: string): number {
  const value = params[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function costComponentForCategory(
  category: ComparisonLineItem['category'],
): NonNullable<ComparisonLineItem['costComponent']> {
  return category === 'network' ? 'egress' : category;
}

function networkDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'egress',
    'load balancer',
    'nat',
    'cdn',
    'vpn',
    'private circuit',
    'direct connect',
    'expressroute',
    'interconnect',
    'dns',
    'cross-az',
    'inter-region',
  ].some((needle) => normalized.includes(needle));
}

function storageDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'storage',
    'snapshot',
    'archive',
    'retrieval',
    'replication',
    'lifecycle',
    'minimum-duration',
    'monitoring',
    'multi-attach',
    'iops',
    'throughput',
    'object request',
    'put request',
    'get request',
    'list request',
    'delete request',
  ].some((needle) => normalized.includes(needle));
}

function storageAdvancedDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'snapshot',
    'archive',
    'retrieval',
    'replication',
    'lifecycle',
    'minimum-duration',
    'monitoring',
    'multi-attach',
    'iops',
    'throughput',
    'object request',
    'put request',
    'get request',
    'list request',
    'delete request',
  ].some((needle) => normalized.includes(needle));
}

function databaseDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'database',
    'db ',
    'nosql',
    'dynamodb',
    'cosmos',
    'firestore',
    'bigtable',
    'ru/s',
    'read unit',
    'write unit',
    'query processing',
    'warehouse',
    'bigquery',
    'redshift',
    'synapse',
    'replica',
    'standby',
    'backup',
    'iops',
    'cache',
    'redis',
    'growth',
    'search',
    'opensearch',
    'cognitive search',
    'azure ai search',
    'cloud search',
    'vertex ai search',
  ].some((needle) => normalized.includes(needle));
}

function databaseAdvancedDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'nosql',
    'dynamodb',
    'cosmos',
    'firestore',
    'bigtable',
    'ru/s',
    'read unit',
    'write unit',
    'query processing',
    'warehouse',
    'bigquery',
    'redshift',
    'synapse',
    'replica',
    'standby',
    'multi-az',
    'backup',
    'iops',
    'cache',
    'redis',
    'growth',
    'search',
    'opensearch',
    'cognitive search',
    'azure ai search',
    'cloud search',
    'vertex ai search',
  ].some((needle) => normalized.includes(needle));
}

function runtimeDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'serverless function',
    'function request',
    'function duration',
    'gb-second',
    'lambda',
    'cloud functions',
    'azure functions',
    'app platform',
    'app runner',
    'app service',
    'cloud run',
    'kubernetes',
    'container registry',
    'registry storage',
    'registry egress',
    'control plane',
    'node overhead',
  ].some((needle) => normalized.includes(needle));
}

function runtimeAdvancedDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'gb-second',
    'duration',
    'function request',
    'app platform',
    'app runner',
    'app service',
    'cloud run',
    'control plane',
    'node overhead',
    'registry storage',
    'registry egress',
  ].some((needle) => normalized.includes(needle));
}

function operationsDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'monitoring',
    'metric',
    'log ingestion',
    'log retention',
    'alarm',
    'dashboard',
    'trace',
    'secret',
    'security posture',
    'security finding',
    'waf',
    'ddos',
  ].some((needle) => normalized.includes(needle));
}

function operationsAdvancedDescription(description: string): boolean {
  const normalized = description.toLowerCase();

  return [
    'log ingestion',
    'log retention',
    'metric',
    'trace',
    'secret',
    'waf',
    'ddos',
    'security posture',
    'security finding',
  ].some((needle) => normalized.includes(needle));
}

function providerRegionLabel(providerId: string, comparisonRegion: string): string {
  if (providerId === 'aws' || providerId === 'azure' || providerId === 'gcp') {
    return providerRegionForCanonicalRegion(comparisonRegion, providerId) ?? comparisonRegion;
  }

  return comparisonRegion;
}

function regionVarianceMultiplier(region: string): number {
  switch (region) {
    case 'us-east':
      return 1;
    case 'us-central':
      return 0.99;
    case 'us-west':
      return 1.03;
    case 'canada':
      return 1.04;
    case 'eu-west':
      return 1.08;
    case 'eu-central':
      return 1.09;
    case 'uk':
      return 1.1;
    case 'ap-south':
      return 0.96;
    case 'ap-southeast':
      return 1.12;
    default:
      return 1;
  }
}

function regionVarianceEvidence(region: string): string {
  const multiplier = regionVarianceMultiplier(region);
  const deltaPercent = Math.round((multiplier - 1) * 100);

  if (region === 'us-east') {
    return 'Baseline North America pricing sensitivity.';
  }

  if (deltaPercent === 0) {
    return 'Modeled neutral regional sensitivity for comparable capacity planning.';
  }

  const direction = deltaPercent > 0 ? 'premium' : 'discount';

  return `Modeled ${Math.abs(deltaPercent)}% regional ${direction} for ${region} capacity sensitivity.`;
}

function costForInterval(monthly: number, interval: ReportInterval): number {
  switch (interval) {
    case 'hourly':
      return monthly / HOURS_PER_MONTH;
    case 'daily':
      return (monthly / HOURS_PER_MONTH) * HOURS_PER_DAY;
    case 'weekly':
      return (monthly / HOURS_PER_MONTH) * HOURS_PER_WEEK;
    case 'monthly':
      return monthly;
    case 'quarterly':
      return monthly * 3;
    case 'yearly':
      return monthly * 12;
  }
}

function scaleParamsText(scaleParams: Record<string, string | number | boolean>): string {
  return Object.entries(scaleParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function tierBandLabel(tierFromGb: number, tierToGb?: number): string {
  return tierToGb !== undefined
    ? `${formatNumber(tierFromGb)}-${formatNumber(tierToGb)} GB`
    : `${formatNumber(tierFromGb)}+ GB`;
}

function formatNumber(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toString();
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
