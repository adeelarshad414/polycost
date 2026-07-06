import { z } from 'zod';
import { HOURS_PER_MONTH } from '../cost-time';

export const SUPPORTED_NWS_SCHEMA_VERSIONS = ['1.0'] as const;

export const workloadSourceTypeSchema = z.enum([
  'natural_language',
  'structured_form',
  'drawio_diagram',
  'terraform',
]);

export const workloadTypeSchema = z.enum([
  'web_app',
  'api_backend',
  'static_site',
  'batch_processing',
  'data_pipeline',
  'ml_workload',
  'other',
]);

export const instanceFamilySchema = z.enum([
  'general-purpose',
  'burstable',
  'compute-optimized',
  'memory-optimized',
  'storage-optimized',
  'accelerated-computing',
]);

export const processorArchitectureSchema = z.enum(['x86_64', 'arm64', 'gpu']);
export const computeTenancySchema = z.enum(['shared', 'dedicated-host', 'sole-tenant']);
export const storageClassSchema = z.enum([
  'standard',
  'hot',
  'cool',
  'cold',
  'nearline',
  'coldline',
  'intelligent-tiering',
  'infrequent-access',
  'one-zone-infrequent-access',
  'archive-instant',
  'archive',
  'deep-archive',
  'premium',
  'ultra',
]);
export const storageReplicationSchema = z.enum(['none', 'same-region', 'cross-region']);

export const computeComponentSchema = z
  .object({
    role: z.string().min(1),
    instanceFamily: instanceFamilySchema.optional(),
    processorArchitecture: processorArchitectureSchema.optional(),
    tenancy: computeTenancySchema.optional(),
    vcpu: z.number().positive().optional(),
    memoryGb: z.number().positive().optional(),
    instanceCount: z.number().int().positive().optional(),
    scalingType: z.enum(['fixed', 'autoscaling']),
    autoscalingRange: z
      .object({
        min: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
      })
      .strict()
      .refine((range) => range.max >= range.min, {
        message: 'autoscalingRange.max must be greater than or equal to min',
        path: ['max'],
      })
      .optional(),
  })
  .strict();

export const storageComponentSchema = z
  .object({
    role: z.string().min(1),
    type: z.enum(['object', 'block', 'file']),
    sizeGb: z.number().positive(),
    accessPattern: z.enum(['frequent', 'infrequent', 'archive']).optional(),
    storageClass: storageClassSchema.optional(),
    monthlyPutRequestsThousand: z.number().nonnegative().optional(),
    monthlyGetRequestsThousand: z.number().nonnegative().optional(),
    monthlyDeleteRequestsThousand: z.number().nonnegative().optional(),
    monthlyListRequestsThousand: z.number().nonnegative().optional(),
    monthlyRetrievalGb: z.number().nonnegative().optional(),
    objectCountThousand: z.number().nonnegative().optional(),
    objectRetentionDays: z.number().int().nonnegative().optional(),
    replication: storageReplicationSchema.optional(),
    lifecycleTransitionsThousand: z.number().nonnegative().optional(),
    snapshotSizeGb: z.number().nonnegative().optional(),
    snapshotRetentionDays: z.number().int().nonnegative().optional(),
    provisionedIops: z.number().int().nonnegative().optional(),
    provisionedThroughputMbps: z.number().nonnegative().optional(),
    multiAttachEnabled: z.boolean().optional(),
  })
  .strict();

export const databaseComponentSchema = z
  .object({
    role: z.string().min(1),
    engine: z.enum([
      'postgres',
      'mysql',
      'sql_server',
      'mongodb',
      'redis',
      'generic_relational',
      'generic_nosql',
    ]),
    sizeGb: z.number().positive().optional(),
    highAvailability: z.boolean(),
    managedServicePreference: z.string().min(1).optional(),
    backupStorageGb: z.number().nonnegative().optional(),
    backupRetentionDays: z.number().int().nonnegative().optional(),
    provisionedIops: z.number().int().nonnegative().optional(),
    readReplicaCount: z.number().int().nonnegative().optional(),
    crossRegionReplicaTransferGb: z.number().nonnegative().optional(),
    nosqlReadRequestUnitsMillion: z.number().nonnegative().optional(),
    nosqlWriteRequestUnitsMillion: z.number().nonnegative().optional(),
    ruPerSecond: z.number().int().nonnegative().optional(),
    queryDataTb: z.number().nonnegative().optional(),
    cacheReplicaCount: z.number().int().nonnegative().optional(),
    storageGrowthGbPerMonth: z.number().nonnegative().optional(),
    searchNodeCount: z.number().int().nonnegative().optional(),
    searchNodeHours: z.number().min(0).max(HOURS_PER_MONTH).optional(),
    searchStorageGb: z.number().nonnegative().optional(),
    searchQueriesMillion: z.number().nonnegative().optional(),
  })
  .strict();

export const workloadProfileSchema = z
  .object({
    environment: z.enum(['production', 'staging', 'development', 'test']).optional(),
    commitmentPreferencePercent: z.number().min(0).max(100).optional(),
    dataResidency: z
      .object({
        scope: z.string().min(1),
        complianceLocked: z.boolean(),
        frameworks: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    operatingSystem: z.enum(['linux', 'windows', 'byol']).optional(),
    supportTier: z
      .enum(['none', 'developer', 'business', 'enterprise_onramp', 'enterprise'])
      .optional(),
    usagePattern: z
      .object({
        type: z.enum(['always_on', 'scheduled', 'bursty']),
        hoursPerDay: z.number().min(1).max(24).optional(),
        daysPerWeek: z.number().int().min(1).max(7).optional(),
        averageUtilizationPercent: z.number().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    tags: z
      .array(
        z
          .object({
            key: z.string().min(1),
            value: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const sourceTraceabilitySchema = z
  .object({
    nwsPath: z.string().min(1),
    sourceRef: z.string().min(1),
  })
  .strict();

export const serviceRequirementSchema = z
  .object({
    serviceCategory: z.enum([
      'compute',
      'containers',
      'application',
      'storage',
      'database',
      'analytics',
      'ai',
      'integration',
      'networking',
      'security',
      'operations',
      'devops',
      'migration',
      'edge',
      'business',
    ]),
    serviceType: z.string().min(1),
    instanceType: z.string().min(1).optional(),
    tier: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    az: z.string().min(1).optional(),
    quantity: z.number().int().positive(),
    scaleParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

export const normalizedWorkloadSpecSchema = z
  .object({
    schemaVersion: z
      .string()
      .refine(
        (value) =>
          SUPPORTED_NWS_SCHEMA_VERSIONS.includes(
            value as (typeof SUPPORTED_NWS_SCHEMA_VERSIONS)[number],
          ),
        {
          message:
            'Unsupported NWS schemaVersion; this build requires a migration before pricing this workload',
        },
      ),
    metadata: z
      .object({
        sourceType: workloadSourceTypeSchema,
        rawInput: z.string().optional(),
        createdAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    workload: z
      .object({
        name: z.string().min(1).optional(),
        type: workloadTypeSchema,
        expectedUsers: z
          .object({
            dailyActiveUsers: z.number().int().nonnegative().optional(),
            peakConcurrentUsers: z.number().int().nonnegative().optional(),
          })
          .strict()
          .optional(),
        region: z
          .object({
            preference: z.string().min(1).optional(),
            isDefault: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    compute: z.array(computeComponentSchema),
    storage: z.array(storageComponentSchema),
    database: z.array(databaseComponentSchema),
    network: z
      .object({
        estimatedMonthlyEgressGb: z.number().nonnegative().optional(),
        crossAzTransferGb: z.number().nonnegative().optional(),
        interRegionTransferGb: z.number().nonnegative().optional(),
        interRegionDestination: z.string().min(1).optional(),
        cdnTrafficGb: z.number().nonnegative().optional(),
        cdnCacheHitRatioPercent: z.number().min(0).max(100).optional(),
        cdnRequestsMillion: z.number().nonnegative().optional(),
        natGatewayGb: z.number().nonnegative().optional(),
        natGatewayHours: z.number().min(0).max(HOURS_PER_MONTH).optional(),
        dnsHostedZones: z.number().int().nonnegative().optional(),
        dnsQueriesMillion: z.number().nonnegative().optional(),
        loadBalancerProcessedGb: z.number().nonnegative().optional(),
        loadBalancerHours: z.number().min(0).max(HOURS_PER_MONTH).optional(),
        loadBalancerNewConnectionsPerSecond: z.number().nonnegative().optional(),
        loadBalancerActiveConnections: z.number().int().nonnegative().optional(),
        loadBalancerRuleEvaluationsPerSecond: z.number().nonnegative().optional(),
        vpnConnectionCount: z.number().int().nonnegative().optional(),
        vpnConnectionHours: z.number().min(0).max(HOURS_PER_MONTH).optional(),
        vpnDataTransferGb: z.number().nonnegative().optional(),
        privateCircuitCount: z.number().int().nonnegative().optional(),
        privateCircuitPortHours: z.number().min(0).max(HOURS_PER_MONTH).optional(),
        privateCircuitDataTransferGb: z.number().nonnegative().optional(),
        cdn: z.boolean(),
        loadBalancer: z.boolean(),
      })
      .strict(),
    availability: z
      .object({
        multiAz: z.boolean(),
        multiRegion: z.boolean(),
        slaTarget: z.string().min(1).optional(),
        faultTolerance: z
          .enum(['single-zone', 'multi-az', 'multi-region', 'active-active'])
          .optional(),
      })
      .strict(),
    workloadProfile: workloadProfileSchema.optional(),
    serviceRequirements: z.array(serviceRequirementSchema).optional(),
    sourceTraceability: z.array(sourceTraceabilitySchema).optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const hasPricedResource =
      spec.compute.length > 0 || spec.storage.length > 0 || spec.database.length > 0;

    if (!hasPricedResource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['compute'],
        message: 'At least one of compute, storage, or database must be non-empty',
      });
    }
  });

export type WorkloadSourceType = z.infer<typeof workloadSourceTypeSchema>;
export type WorkloadType = z.infer<typeof workloadTypeSchema>;
export type ComputeComponent = z.infer<typeof computeComponentSchema>;
export type StorageComponent = z.infer<typeof storageComponentSchema>;
export type DatabaseComponent = z.infer<typeof databaseComponentSchema>;
export type WorkloadProfile = z.infer<typeof workloadProfileSchema>;
export type SourceTraceability = z.infer<typeof sourceTraceabilitySchema>;
export type ServiceRequirement = z.infer<typeof serviceRequirementSchema>;
export type NormalizedWorkloadSpec = z.infer<typeof normalizedWorkloadSpecSchema>;
