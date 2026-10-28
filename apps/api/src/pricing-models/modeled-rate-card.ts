import type { ProviderId } from '../adapters/common/cloud-provider-adapter.js';
import type { NormalizedWorkloadSpec } from '../nws/nws.types.js';

export type StorageClassKey = NonNullable<
  NormalizedWorkloadSpec['storage'][number]['storageClass']
>;

/*
  The modeled rate card (ADR-0002, audit H-10).

  Some figures PolyCost shows are not single provider SKUs but approximations of
  a pricing model: request-metered app platforms, function GB-seconds, ARM price
  ratios, regional premiums, inter-region transfer between canonical regions,
  burstable CPU credits. They used to be hard-coded twice - in the web app and in
  the comparison engine - with no date. This is now the only copy: the engine
  imports it, and the web app reads it from GET /api/v1/pricing/rate-card.

  Every group says where its numbers come from and when someone last checked them
  against the provider's published prices (`reviewedAt`). CI fails once a group is
  more than RATE_CARD_MAX_AGE_DAYS old (modeled-rate-card.spec.ts, part of every
  CI run), so a stale rate is a failed build, not a silent drift. To re-review: check the
  source, update the values, and move `reviewedAt` to the day you checked.

  Prices are USD list prices, on-demand, before discounts.
*/

export const RATE_CARD_MAX_AGE_DAYS = 180;

export interface RateGroup<T> {
  /** Where the numbers come from. */
  source: string;
  /** ISO date someone last compared these numbers with the provider's prices. */
  reviewedAt: string;
  rates: T;
}

export interface AppPlatformRates {
  requestPerMillion: number;
  vcpuHour: number;
  memoryGbHour: number;
  alwaysOnVcpuHour: number;
  alwaysOnMemoryGbHour: number;
  evidence: string;
}

export interface ServerlessFunctionRates {
  requestPerMillion: number;
  gbSecond: number;
  evidence: string;
}

export interface RegionVarianceProfile {
  regionId: string;
  multiplier: number;
  evidence: string;
}

export interface InterRegionTransferRates {
  /** USD per GB for a named route, "source->destination" canonical regions. */
  routes: Record<string, number>;
  /** USD per GB when the route is not listed. */
  sameContinent: number;
  crossContinent: number;
}

export interface BurstableCreditPolicy {
  familyLabel: string;
  baselineUtilizationPercent: number;
  unitPriceUsd: number;
  unit: string;
  zeroCostLabel: string;
}

// Rate shapes used by the comparison engine, one per service area.

export interface StorageDimensionRates {
  putPerThousand: number;
  getPerThousand: number;
  deletePerThousand: number;
  listPerThousand: number;
  retrievalPerGb: Partial<Record<StorageClassKey, number>>;
  storagePerGbMonth: Partial<Record<StorageClassKey, number>>;
  minimumDurationDays: Partial<Record<StorageClassKey, number>>;
  intelligentTieringMonitoringPerThousandObjects: number;
  replicationSameRegionPerGb: number;
  replicationCrossRegionPerGb: number;
  lifecyclePerThousand: number;
  snapshotPerGbMonth: number;
  iopsMonth: number;
  throughputMbpsMonth: number;
  multiAttachPerGbMonth: number;
}
export interface DatabaseDimensionRates {
  backupPerGbMonth: number;
  provisionedIopsMonth: number;
  readReplicaMonthlyFactor: number;
  highAvailabilityStandbyFactor: number;
  crossRegionReplicaTransferPerGb: number;
  nosqlReadPerMillion: number;
  nosqlWritePerMillion: number;
  ruPerSecondMonth: number;
  queryPerTb: number;
  cacheReplicaMonthly: number;
  storageGrowthPerGbMonth: number;
  searchNodeHour: number;
  searchStoragePerGbMonth: number;
  searchQueryPerMillion: number;
}
export interface SupportingServicesRates {
  metricPerMillion: number;
  logIngestPerGb: number;
  logRetentionPerGbMonth: number;
  alarmMonthly: number;
  dashboardMonthly: number;
  tracePerMillion: number;
  secretMonthly: number;
  secretApiPerTenThousand: number;
  securityResourceMonthly: number;
  securityFindingPerThousand: number;
  wafAclMonthly: number;
  wafRuleMonthly: number;
  wafRequestPerMillion: number;
  ddosProtectedResourceMonthly: number;
}
export interface RuntimeServicesRates {
  functionRequestPerMillion: number;
  functionGbSecond: number;
  appPlatformRequestPerMillion: number;
  appPlatformVcpuHour: number;
  appPlatformMemoryGbHour: number;
  appPlatformAlwaysOnVcpuHour: number;
  appPlatformAlwaysOnMemoryGbHour: number;
  kubernetesControlPlaneMonthly: number;
  kubernetesWorkerVcpuHour: number;
  kubernetesWorkerMemoryGbHour: number;
  kubernetesNodeOverheadMonthly: number;
  registryStoragePerGbMonth: number;
  registryEgressPerGb: number;
}
export interface AnalyticsServicesRates {
  warehouseStoragePerGbMonth: number;
  warehouseQueryPerTb: number;
  dataLakeStoragePerGbMonth: number;
  integrationJobHour: number;
  streamingIngestPerGb: number;
  biUserMonthly: number;
}
export interface AiServicesRates {
  trainingGpuHour: number;
  modelHostingHour: number;
  inferenceRequestPerMillion: number;
  vectorStoragePerGbMonth: number;
  vectorQueryPerMillion: number;
  apiInputTokenPerMillion: number;
  apiOutputTokenPerMillion: number;
}
export interface IntegrationServicesRates {
  queueMessagePerMillion: number;
  eventRoutingPerMillion: number;
  workflowTransitionPerThousand: number;
  apiGatewayRequestPerMillion: number;
}
export interface NetworkDimensionRates {
  crossAzPerGb: number;
  interRegionPerGb: number;
  cdnViewerPerGb: number;
  cdnOriginPerGb: number;
  cdnRequestPerMillion: number;
  natHourly: number;
  natPerGb: number;
  dnsZoneMonthly: number;
  dnsPerMillionQueries: number;
  loadBalancerHourly: number;
  loadBalancerPerGb: number;
  loadBalancerLcuHour: number;
  vpnConnectionHourly: number;
  vpnDataTransferPerGb: number;
  privateCircuitPortHourly: number;
  privateCircuitDataTransferPerGb: number;
}
export interface ModeledRateCard {
  appPlatform: RateGroup<Record<ProviderId, AppPlatformRates>>;
  serverlessFunctions: RateGroup<Record<ProviderId, ServerlessFunctionRates>>;
  computeArmCostFactors: RateGroup<Record<ProviderId, number>>;
  regionVariance: RateGroup<RegionVarianceProfile[]>;
  interRegionTransfer: RateGroup<Record<ProviderId, InterRegionTransferRates>>;
  burstableCredits: RateGroup<Record<ProviderId, BurstableCreditPolicy>>;
  storage: RateGroup<Record<ProviderId, StorageDimensionRates>>;
  database: RateGroup<Record<ProviderId, DatabaseDimensionRates>>;
  supportingServices: RateGroup<Record<ProviderId, SupportingServicesRates>>;
  runtimeServices: RateGroup<Record<ProviderId, RuntimeServicesRates>>;
  analyticsServices: RateGroup<Record<ProviderId, AnalyticsServicesRates>>;
  aiServices: RateGroup<Record<ProviderId, AiServicesRates>>;
  integrationServices: RateGroup<Record<ProviderId, IntegrationServicesRates>>;
  network: RateGroup<Record<ProviderId, NetworkDimensionRates>>;
}

// Functions and app platforms are priced by the engine from this group; the
// app-platform and function groups the web app reads are derived from it, so
// each of these prices exists exactly once.
const RUNTIME_SERVICES: RateGroup<Record<ProviderId, RuntimeServicesRates>> = {
  source:
    'Functions, app platforms, managed Kubernetes and container registry list prices (Lambda/App Runner/EKS/ECR, Functions/App Service/AKS/ACR, Cloud Run/GKE/Artifact Registry).',
  reviewedAt: '2026-07-01',
  rates: {
    aws: {
      functionRequestPerMillion: 0.2,
      functionGbSecond: 0.0000166667,
      appPlatformRequestPerMillion: 0,
      appPlatformVcpuHour: 0.064,
      appPlatformMemoryGbHour: 0.007,
      appPlatformAlwaysOnVcpuHour: 0.064,
      appPlatformAlwaysOnMemoryGbHour: 0.007,
      kubernetesControlPlaneMonthly: 73,
      kubernetesWorkerVcpuHour: 0.0416,
      kubernetesWorkerMemoryGbHour: 0.0046,
      kubernetesNodeOverheadMonthly: 8,
      registryStoragePerGbMonth: 0.1,
      registryEgressPerGb: 0.09,
    },
    azure: {
      functionRequestPerMillion: 0.2,
      functionGbSecond: 0.000016,
      appPlatformRequestPerMillion: 0.4,
      appPlatformVcpuHour: 0.0864,
      appPlatformMemoryGbHour: 0.009,
      appPlatformAlwaysOnVcpuHour: 0.095,
      appPlatformAlwaysOnMemoryGbHour: 0.012,
      kubernetesControlPlaneMonthly: 0,
      kubernetesWorkerVcpuHour: 0.0464,
      kubernetesWorkerMemoryGbHour: 0.0052,
      kubernetesNodeOverheadMonthly: 6,
      registryStoragePerGbMonth: 0.167,
      registryEgressPerGb: 0.087,
    },
    gcp: {
      functionRequestPerMillion: 0.4,
      functionGbSecond: 0.0000025,
      appPlatformRequestPerMillion: 0.4,
      appPlatformVcpuHour: 0.0864,
      appPlatformMemoryGbHour: 0.009,
      appPlatformAlwaysOnVcpuHour: 0.0648,
      appPlatformAlwaysOnMemoryGbHour: 0.00675,
      kubernetesControlPlaneMonthly: 73,
      kubernetesWorkerVcpuHour: 0.0332,
      kubernetesWorkerMemoryGbHour: 0.0045,
      kubernetesNodeOverheadMonthly: 7,
      registryStoragePerGbMonth: 0.1,
      registryEgressPerGb: 0.12,
    },
  },
};

const PROVIDER_IDS: ProviderId[] = ['aws', 'azure', 'gcp'];

const APP_PLATFORM_EVIDENCE: Record<ProviderId, string> = {
  aws: 'App Runner-style active vCPU plus provisioned/active memory model.',
  azure: 'App Service always-on plan compared with a request-metered managed-app approximation.',
  gcp: 'Cloud Run request-based model compared with always-allocated CPU worker posture.',
};

const FUNCTION_EVIDENCE: Record<ProviderId, string> = {
  aws: 'Lambda-style requests plus GB-second duration model.',
  azure: 'Azure Functions-style executions plus GB-second duration model.',
  gcp: 'Cloud Run functions-style invocations plus GB-second duration model.',
};

function perProvider<T>(build: (providerId: ProviderId) => T): Record<ProviderId, T> {
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, build(id)])) as Record<ProviderId, T>;
}

function appPlatformGroup(
  runtime: RateGroup<Record<ProviderId, RuntimeServicesRates>>,
): RateGroup<Record<ProviderId, AppPlatformRates>> {
  return {
    source: runtime.source,
    reviewedAt: runtime.reviewedAt,
    rates: perProvider((id) => ({
      requestPerMillion: runtime.rates[id].appPlatformRequestPerMillion,
      vcpuHour: runtime.rates[id].appPlatformVcpuHour,
      memoryGbHour: runtime.rates[id].appPlatformMemoryGbHour,
      alwaysOnVcpuHour: runtime.rates[id].appPlatformAlwaysOnVcpuHour,
      alwaysOnMemoryGbHour: runtime.rates[id].appPlatformAlwaysOnMemoryGbHour,
      evidence: APP_PLATFORM_EVIDENCE[id],
    })),
  };
}

function serverlessFunctionsGroup(
  runtime: RateGroup<Record<ProviderId, RuntimeServicesRates>>,
): RateGroup<Record<ProviderId, ServerlessFunctionRates>> {
  return {
    source: runtime.source,
    reviewedAt: runtime.reviewedAt,
    rates: perProvider((id) => ({
      requestPerMillion: runtime.rates[id].functionRequestPerMillion,
      gbSecond: runtime.rates[id].functionGbSecond,
      evidence: FUNCTION_EVIDENCE[id],
    })),
  };
}

export const MODELED_RATE_CARD: ModeledRateCard = {
  appPlatform: appPlatformGroup(RUNTIME_SERVICES),
  serverlessFunctions: serverlessFunctionsGroup(RUNTIME_SERVICES),
  computeArmCostFactors: {
    source:
      'Ratio of ARM to x86 on-demand price for like-sized general-purpose instances (Graviton, Ampere Altra, Tau T2A).',
    reviewedAt: '2026-07-02',
    rates: { aws: 0.8, azure: 0.85, gcp: 0.82 },
  },
  regionVariance: {
    source:
      'Modeled sensitivity of list prices by canonical region relative to US East; not a provider SKU.',
    reviewedAt: '2026-07-02',
    rates: [
      {
        regionId: 'us-east',
        multiplier: 1,
        evidence: 'Baseline North America pricing sensitivity.',
      },
      {
        regionId: 'us-central',
        multiplier: 0.99,
        evidence: 'Modeled 1% regional discount for central US capacity sensitivity.',
      },
      {
        regionId: 'us-west',
        multiplier: 1.03,
        evidence: 'Modeled 3% regional premium for west-coast capacity sensitivity.',
      },
      {
        regionId: 'eu-west',
        multiplier: 1.08,
        evidence: 'Modeled 8% regional premium for EU residency/compliance sensitivity.',
      },
      {
        regionId: 'eu-central',
        multiplier: 1.09,
        evidence: 'Modeled 9% regional premium for EU central capacity sensitivity.',
      },
      {
        regionId: 'uk',
        multiplier: 1.1,
        evidence: 'Modeled 10% regional premium for UK residency sensitivity.',
      },
      {
        regionId: 'canada',
        multiplier: 1.04,
        evidence: 'Modeled 4% regional premium for Canada residency sensitivity.',
      },
      {
        regionId: 'ap-southeast',
        multiplier: 1.12,
        evidence: 'Modeled 12% regional premium for APAC latency/residency sensitivity.',
      },
      {
        regionId: 'ap-south',
        multiplier: 0.96,
        evidence: 'Modeled 4% discount sensitivity for lower-cost APAC alternatives.',
      },
    ],
  },
  interRegionTransfer: {
    source:
      'AWS EC2 data transfer, Azure bandwidth and Google Cloud network pricing pages: inter-region transfer per GB.',
    reviewedAt: '2026-07-04',
    rates: {
      aws: {
        routes: {
          'us-east->us-west': 0.02,
          'us-east->eu-west': 0.05,
          'us-east->ap-south': 0.09,
          'us-west->ap-south': 0.09,
          'eu-west->ap-south': 0.09,
        },
        sameContinent: 0.02,
        crossContinent: 0.05,
      },
      azure: {
        routes: {
          'us-east->us-west': 0.02,
          'us-east->eu-west': 0.05,
          'us-east->ap-south': 0.087,
          'eu-west->ap-south': 0.087,
        },
        sameContinent: 0.02,
        crossContinent: 0.05,
      },
      gcp: {
        routes: {
          'us-central->us-east': 0.01,
          'us-central->europe-west': 0.08,
          'us-east->europe-west': 0.08,
          'us-central->asia-south': 0.12,
          'europe-west->asia-south': 0.12,
        },
        sameContinent: 0.01,
        crossContinent: 0.08,
      },
    },
  },
  burstableCredits: {
    source:
      'AWS T-series unlimited-mode surplus credit price; Azure B-series and GCP E2 shared-core have no credit charge.',
    reviewedAt: '2026-07-04',
    rates: {
      aws: {
        familyLabel: 'T-series',
        baselineUtilizationPercent: 20,
        unitPriceUsd: 0.05,
        unit: 'vCPU-credit-hour',
        zeroCostLabel: 'CPU credit baseline signal',
      },
      azure: {
        familyLabel: 'B-series',
        baselineUtilizationPercent: 20,
        unitPriceUsd: 0,
        unit: 'vCPU-credit-hour',
        zeroCostLabel: 'CPU credit depletion risk signal',
      },
      gcp: {
        familyLabel: 'E2 shared-core',
        baselineUtilizationPercent: 20,
        unitPriceUsd: 0,
        unit: 'vCPU-credit-hour',
        zeroCostLabel: 'scheduling risk signal',
      },
    },
  },
  storage: {
    source:
      'Object and block storage list prices (S3/EBS, Blob/Managed Disks, Cloud Storage/Persistent Disk): capacity, requests, retrieval, replication, snapshots, IOPS and throughput.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        putPerThousand: 0.005,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.005,
        retrievalPerGb: {
          'intelligent-tiering': 0.003,
          'infrequent-access': 0.01,
          'one-zone-infrequent-access': 0.01,
          'archive-instant': 0.03,
          archive: 0.03,
          'deep-archive': 0.02,
          cool: 0.01,
          cold: 0.02,
          nearline: 0.01,
          coldline: 0.02,
        },
        storagePerGbMonth: {
          standard: 0.023,
          hot: 0.023,
          'intelligent-tiering': 0.023,
          'infrequent-access': 0.0125,
          'one-zone-infrequent-access': 0.01,
          'archive-instant': 0.004,
          archive: 0.0036,
          'deep-archive': 0.00099,
          cool: 0.0125,
          cold: 0.004,
          nearline: 0.0125,
          coldline: 0.004,
        },
        minimumDurationDays: {
          'infrequent-access': 30,
          'one-zone-infrequent-access': 30,
          'archive-instant': 90,
          archive: 90,
          'deep-archive': 180,
          cool: 30,
          cold: 90,
          nearline: 30,
          coldline: 90,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.05,
        iopsMonth: 0.005,
        throughputMbpsMonth: 0.04,
        multiAttachPerGbMonth: 0.02,
      },
      azure: {
        putPerThousand: 0.004,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.004,
        retrievalPerGb: {
          cool: 0.01,
          cold: 0.02,
          archive: 0.02,
          'deep-archive': 0.02,
          'infrequent-access': 0.01,
          nearline: 0.01,
          coldline: 0.02,
        },
        storagePerGbMonth: {
          standard: 0.0184,
          hot: 0.0184,
          cool: 0.01,
          cold: 0.0036,
          archive: 0.00099,
          'deep-archive': 0.00099,
          'infrequent-access': 0.01,
          nearline: 0.01,
          coldline: 0.0036,
          premium: 0.15,
          ultra: 0.18,
        },
        minimumDurationDays: {
          cool: 30,
          cold: 90,
          archive: 180,
          'deep-archive': 180,
          'infrequent-access': 30,
          nearline: 30,
          coldline: 90,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.008,
        replicationCrossRegionPerGb: 0.018,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.045,
        iopsMonth: 0.004,
        throughputMbpsMonth: 0.035,
        multiAttachPerGbMonth: 0.015,
      },
      gcp: {
        putPerThousand: 0.005,
        getPerThousand: 0.0004,
        deletePerThousand: 0,
        listPerThousand: 0.005,
        retrievalPerGb: {
          nearline: 0.01,
          coldline: 0.02,
          archive: 0.05,
          'deep-archive': 0.05,
          cool: 0.01,
          cold: 0.02,
          'infrequent-access': 0.01,
        },
        storagePerGbMonth: {
          standard: 0.02,
          hot: 0.02,
          nearline: 0.01,
          coldline: 0.004,
          archive: 0.0012,
          'deep-archive': 0.0012,
          cool: 0.01,
          cold: 0.004,
          'infrequent-access': 0.01,
        },
        minimumDurationDays: {
          nearline: 30,
          coldline: 90,
          archive: 365,
          'deep-archive': 365,
          cool: 30,
          cold: 90,
          'infrequent-access': 30,
        },
        intelligentTieringMonitoringPerThousandObjects: 0.0025,
        replicationSameRegionPerGb: 0.01,
        replicationCrossRegionPerGb: 0.02,
        lifecyclePerThousand: 0.01,
        snapshotPerGbMonth: 0.026,
        iopsMonth: 0.0045,
        throughputMbpsMonth: 0.032,
        multiAttachPerGbMonth: 0.012,
      },
    },
  },
  database: {
    source:
      'Managed relational database list prices (RDS/Aurora, Azure Database, Cloud SQL): storage, IOPS, backup, replicas and I/O.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        backupPerGbMonth: 0.095,
        provisionedIopsMonth: 0.1,
        readReplicaMonthlyFactor: 0.85,
        highAvailabilityStandbyFactor: 0.55,
        crossRegionReplicaTransferPerGb: 0.02,
        nosqlReadPerMillion: 0.25,
        nosqlWritePerMillion: 1.25,
        ruPerSecondMonth: 0.008,
        queryPerTb: 5,
        cacheReplicaMonthly: 45,
        storageGrowthPerGbMonth: 0.115,
        searchNodeHour: 0.24,
        searchStoragePerGbMonth: 0.135,
        searchQueryPerMillion: 0,
      },
      azure: {
        backupPerGbMonth: 0.1,
        provisionedIopsMonth: 0.065,
        readReplicaMonthlyFactor: 0.9,
        highAvailabilityStandbyFactor: 0.6,
        crossRegionReplicaTransferPerGb: 0.018,
        nosqlReadPerMillion: 0.3,
        nosqlWritePerMillion: 1.2,
        ruPerSecondMonth: 0.008,
        queryPerTb: 5,
        cacheReplicaMonthly: 42,
        storageGrowthPerGbMonth: 0.12,
        searchNodeHour: 0.336,
        searchStoragePerGbMonth: 0.1,
        searchQueryPerMillion: 0,
      },
      gcp: {
        backupPerGbMonth: 0.08,
        provisionedIopsMonth: 0.065,
        readReplicaMonthlyFactor: 0.85,
        highAvailabilityStandbyFactor: 0.55,
        crossRegionReplicaTransferPerGb: 0.02,
        nosqlReadPerMillion: 0.18,
        nosqlWritePerMillion: 1.08,
        ruPerSecondMonth: 0.0075,
        queryPerTb: 5,
        cacheReplicaMonthly: 40,
        storageGrowthPerGbMonth: 0.17,
        searchNodeHour: 0.008219,
        searchStoragePerGbMonth: 5,
        searchQueryPerMillion: 1500,
      },
    },
  },
  supportingServices: {
    source:
      'Monitoring, logging, secrets, key management, DNS, security scanning, WAF and DDoS protection list prices per provider.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        metricPerMillion: 0.3,
        logIngestPerGb: 0.5,
        logRetentionPerGbMonth: 0.03,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 5,
        secretMonthly: 0.4,
        secretApiPerTenThousand: 0.05,
        securityResourceMonthly: 0.03,
        securityFindingPerThousand: 0.2,
        wafAclMonthly: 5,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.6,
        ddosProtectedResourceMonthly: 3000,
      },
      azure: {
        metricPerMillion: 0.258,
        logIngestPerGb: 2.76,
        logRetentionPerGbMonth: 0.12,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 2.3,
        secretMonthly: 0.03,
        secretApiPerTenThousand: 0.03,
        securityResourceMonthly: 0.02,
        securityFindingPerThousand: 0.15,
        wafAclMonthly: 20,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.6,
        ddosProtectedResourceMonthly: 199,
      },
      gcp: {
        metricPerMillion: 0.258,
        logIngestPerGb: 0.5,
        logRetentionPerGbMonth: 0.01,
        alarmMonthly: 0.1,
        dashboardMonthly: 3,
        tracePerMillion: 0.2,
        secretMonthly: 0.06,
        secretApiPerTenThousand: 0.03,
        securityResourceMonthly: 0.02,
        securityFindingPerThousand: 0.1,
        wafAclMonthly: 5,
        wafRuleMonthly: 1,
        wafRequestPerMillion: 0.75,
        ddosProtectedResourceMonthly: 3000,
      },
    },
  },
  runtimeServices: RUNTIME_SERVICES,
  analyticsServices: {
    source: 'Data warehouse, query and streaming list prices per provider.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        warehouseStoragePerGbMonth: 0.024,
        warehouseQueryPerTb: 5,
        dataLakeStoragePerGbMonth: 0.023,
        integrationJobHour: 0.44,
        streamingIngestPerGb: 0.014,
        biUserMonthly: 24,
      },
      azure: {
        warehouseStoragePerGbMonth: 0.024,
        warehouseQueryPerTb: 5,
        dataLakeStoragePerGbMonth: 0.0208,
        integrationJobHour: 0.25,
        streamingIngestPerGb: 0.03,
        biUserMonthly: 10,
      },
      gcp: {
        warehouseStoragePerGbMonth: 0.02,
        warehouseQueryPerTb: 6.25,
        dataLakeStoragePerGbMonth: 0.02,
        integrationJobHour: 0.18,
        streamingIngestPerGb: 0.04,
        biUserMonthly: 30,
      },
    },
  },
  aiServices: {
    source: 'Managed AI and model-inference list prices per provider.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        trainingGpuHour: 3.06,
        modelHostingHour: 0.24,
        inferenceRequestPerMillion: 0.2,
        vectorStoragePerGbMonth: 0.25,
        vectorQueryPerMillion: 0.1,
        apiInputTokenPerMillion: 0.8,
        apiOutputTokenPerMillion: 2.4,
      },
      azure: {
        trainingGpuHour: 3.67,
        modelHostingHour: 0.28,
        inferenceRequestPerMillion: 0.18,
        vectorStoragePerGbMonth: 0.23,
        vectorQueryPerMillion: 0.12,
        apiInputTokenPerMillion: 0.5,
        apiOutputTokenPerMillion: 1.5,
      },
      gcp: {
        trainingGpuHour: 2.93,
        modelHostingHour: 0.22,
        inferenceRequestPerMillion: 0.25,
        vectorStoragePerGbMonth: 0.2,
        vectorQueryPerMillion: 0.08,
        apiInputTokenPerMillion: 0.35,
        apiOutputTokenPerMillion: 1.05,
      },
    },
  },
  integrationServices: {
    source: 'Queue, pub/sub, event and API gateway list prices per provider.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        queueMessagePerMillion: 0.4,
        eventRoutingPerMillion: 1,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3.5,
      },
      azure: {
        queueMessagePerMillion: 0.05,
        eventRoutingPerMillion: 0.6,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3.5,
      },
      gcp: {
        queueMessagePerMillion: 0.4,
        eventRoutingPerMillion: 0.6,
        workflowTransitionPerThousand: 0.025,
        apiGatewayRequestPerMillion: 3,
      },
    },
  },
  network: {
    source:
      'Load balancer, NAT, CDN, private connectivity and internet egress list prices per provider.',
    reviewedAt: '2026-07-01',
    rates: {
      aws: {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.085,
        cdnOriginPerGb: 0.01,
        cdnRequestPerMillion: 0.75,
        natHourly: 0.045,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.5,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.0225,
        loadBalancerPerGb: 0.008,
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.09,
        privateCircuitPortHourly: 0.3,
        privateCircuitDataTransferPerGb: 0.02,
      },
      azure: {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.081,
        cdnOriginPerGb: 0.01,
        cdnRequestPerMillion: 0.75,
        natHourly: 0.045,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.5,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.025,
        loadBalancerPerGb: 0.005,
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.087,
        privateCircuitPortHourly: 0.42,
        privateCircuitDataTransferPerGb: 0.025,
      },
      gcp: {
        crossAzPerGb: 0.01,
        interRegionPerGb: 0.02,
        cdnViewerPerGb: 0.08,
        cdnOriginPerGb: 0.01,
        cdnRequestPerMillion: 0.75,
        natHourly: 0.0014,
        natPerGb: 0.045,
        dnsZoneMonthly: 0.2,
        dnsPerMillionQueries: 0.4,
        loadBalancerHourly: 0.025,
        loadBalancerPerGb: 0.008,
        loadBalancerLcuHour: 0.008,
        vpnConnectionHourly: 0.05,
        vpnDataTransferPerGb: 0.12,
        privateCircuitPortHourly: 2.428,
        privateCircuitDataTransferPerGb: 0.02,
      },
    },
  },
};

/** The rate card as served: every group, plus the oldest review date as `pricingAsOf`. */
export interface RateCardResponse extends ModeledRateCard {
  kind: 'modeled';
  pricingAsOf: string;
  maxAgeDays: number;
}

export function rateCardResponse(card: ModeledRateCard = MODELED_RATE_CARD): RateCardResponse {
  return {
    kind: 'modeled',
    pricingAsOf: oldestReview(card),
    maxAgeDays: RATE_CARD_MAX_AGE_DAYS,
    ...card,
  };
}

export function rateGroups(card: ModeledRateCard): Array<[string, RateGroup<unknown>]> {
  return Object.entries(card) as Array<[string, RateGroup<unknown>]>;
}

export function oldestReview(card: ModeledRateCard): string {
  return rateGroups(card)
    .map(([, group]) => group.reviewedAt)
    .sort()[0] as string;
}

/** Groups whose review is older than the allowed age on `today` (ISO date). */
export function staleRateGroups(
  card: ModeledRateCard,
  today: string,
  maxAgeDays = RATE_CARD_MAX_AGE_DAYS,
): Array<{ group: string; reviewedAt: string; ageDays: number }> {
  const now = Date.parse(`${today}T00:00:00Z`);
  return rateGroups(card)
    .map(([group, value]) => ({
      group,
      reviewedAt: value.reviewedAt,
      ageDays: Math.floor((now - Date.parse(`${value.reviewedAt}T00:00:00Z`)) / 86_400_000),
    }))
    .filter((entry) => !(entry.ageDays <= maxAgeDays));
}
