import {
  applyTheme,
  resolveTheme,
  storedTheme,
  subscribeToSystemTheme,
  systemTheme,
  THEME_STORAGE_KEY,
} from './theme';
import { CLOUD_SERVICE_CATALOG, DEFAULT_SELECTED_SERVICE_FAMILY_IDS } from './service-catalog';
import { HOURS_PER_MONTH } from './cost-time';
import { NormalizedWorkloadSpec } from './types';
import {
  ARCHITECTURE_TEMPLATES,
  buildNwsFromForm,
  defaultWorkloadForm,
  formFromNws,
  validateWorkloadForm,
} from './workload';

describe('workload helpers', () => {
  it('derives always-on workload defaults from the shared monthly-hours constant', () => {
    expect(defaultWorkloadForm.databaseSearchNodeHours).toBe(String(HOURS_PER_MONTH));
    expect(defaultWorkloadForm.appPlatformAlwaysOnHours).toBe(String(HOURS_PER_MONTH));
    expect(
      ARCHITECTURE_TEMPLATES.find((template) => template.id === 'machine-learning-training')?.form
        .aiModelHostingHours,
    ).toBe(String(HOURS_PER_MONTH));
  });

  it('marks archive storage as priced because class, retrieval, lifecycle, and snapshot dimensions are modeled', () => {
    expect(CLOUD_SERVICE_CATALOG.find((family) => family.id === 'archive-storage')).toEqual(
      expect.objectContaining({
        supportStatus: 'priced',
      }),
    );
  });

  it('serializes serverless container runtime drivers into the NWS', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyId: 'serverless-containers',
      selectedServiceFamilyIds: ['serverless-containers'],
      appPlatformRequestsMillion: '12',
      appPlatformRequestDurationMs: '350',
      appPlatformVcpu: '2',
      appPlatformMemoryGb: '1',
    });

    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'containers',
        serviceType: 'serverless-containers',
        scaleParams: expect.objectContaining({
          appPlatformRequestsMillion: 12,
          appPlatformRequestDurationMs: 350,
          appPlatformVcpu: 2,
          appPlatformMemoryGb: 1,
        }),
      }),
    );
  });

  it('builds a valid NWS from the structured form', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      scalingType: 'autoscaling',
    });

    expect(nws.schemaVersion).toBe('1.0');
    expect(nws.metadata.sourceType).toBe('structured_form');
    expect(nws.compute[0]).toMatchObject({
      role: 'web',
      vcpu: 2,
      memoryGb: 4,
      instanceFamily: 'general-purpose',
      processorArchitecture: 'x86_64',
      tenancy: 'shared',
      instanceCount: 2,
      scalingType: 'autoscaling',
      autoscalingRange: {
        min: 2,
        max: 6,
      },
    });
    expect(nws.storage[0]).toMatchObject({
      type: 'object',
      sizeGb: 250,
    });
    expect(nws.database[0]).toMatchObject({
      engine: 'postgres',
      highAvailability: true,
    });
    expect(nws.network).toMatchObject({
      cdn: true,
      loadBalancer: true,
      estimatedMonthlyEgressGb: 750,
    });
    expect(nws.availability).toMatchObject({
      faultTolerance: 'multi-az',
    });
    expect(nws.workloadProfile).toMatchObject({
      environment: 'production',
      commitmentPreferencePercent: 65,
      operatingSystem: 'linux',
      supportTier: 'business',
      usagePattern: {
        type: 'always_on',
      },
      dataResidency: {
        scope: 'global',
        complianceLocked: false,
        frameworks: ['SOC 2'],
      },
      tags: [
        {
          key: 'team',
          value: 'platform',
        },
        {
          key: 'project',
          value: 'polycost-demo',
        },
      ],
    });
    expect(nws.sourceTraceability).toContainEqual({
      nwsPath: 'metadata.serviceCatalog',
      sourceRef: 'serviceCatalog:vm-compute',
    });
    expect(nws.sourceTraceability).toContainEqual({
      nwsPath: 'metadata.serviceCatalog',
      sourceRef: 'serviceCatalog:object-storage',
    });
    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'compute',
          serviceType: 'vm-compute',
          quantity: 2,
          tier: 'balanced',
          scaleParams: expect.objectContaining({
            instanceFamily: 'general-purpose',
            processorArchitecture: 'x86_64',
            tenancy: 'shared',
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'database',
          serviceType: 'relational-database',
          tier: 'high-availability',
        }),
      ]),
    );
  });

  it('round-trips accelerated compute intent through the NWS', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      instanceTier: 'accelerated',
    });

    expect(nws.compute[0]).toMatchObject({
      instanceFamily: 'accelerated-computing',
      processorArchitecture: 'gpu',
      tenancy: 'shared',
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'compute',
        serviceType: 'vm-compute',
        instanceType: 'GPU / accelerated tier / GPU / shared tenancy - 2 vCPU - 4GB',
        tier: 'accelerated',
        scaleParams: expect.objectContaining({
          instanceFamily: 'accelerated-computing',
          processorArchitecture: 'gpu',
          tenancy: 'shared',
        }),
      }),
    );
    expect(formFromNws(nws).instanceTier).toBe('accelerated');
  });

  it('round-trips burstable compute intent through the NWS', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyId: 'burstable-compute',
      selectedServiceFamilyIds: ['burstable-compute'],
      instanceTier: 'balanced',
    });

    expect(nws.compute[0]).toMatchObject({
      instanceFamily: 'burstable',
      processorArchitecture: 'x86_64',
      tenancy: 'shared',
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'compute',
        serviceType: 'burstable-compute',
        instanceType: 'burstable / shared-core tier / x86 / shared tenancy - 2 vCPU - 4GB',
        tier: 'small',
        scaleParams: expect.objectContaining({
          instanceFamily: 'burstable',
          processorArchitecture: 'x86_64',
          tenancy: 'shared',
        }),
      }),
    );
    expect(formFromNws(nws).instanceTier).toBe('small');
  });

  it('round-trips ARM and dedicated-host compute intent through the NWS', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      processorArchitecture: 'arm64',
      computeTenancy: 'dedicated-host',
    });

    expect(nws.compute[0]).toMatchObject({
      processorArchitecture: 'arm64',
      tenancy: 'dedicated-host',
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'compute',
        instanceType: 'balanced general-purpose tier / ARM / dedicated host - 2 vCPU - 4GB',
        scaleParams: expect.objectContaining({
          processorArchitecture: 'arm64',
          tenancy: 'dedicated-host',
        }),
      }),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        processorArchitecture: 'arm64',
        computeTenancy: 'dedicated-host',
      }),
    );
  });

  it('ships valid quick-start architecture templates', () => {
    expect(ARCHITECTURE_TEMPLATES.map((template) => template.id)).toEqual([
      'web-application-tier',
      'data-analytics-pipeline',
      'machine-learning-training',
      'high-traffic-api',
      'lamp-stack',
      'three-tier-enterprise-app',
      'microservices-platform',
    ]);

    for (const template of ARCHITECTURE_TEMPLATES) {
      expect(validateWorkloadForm(template.form)).toEqual([]);
      expect(buildNwsFromForm(template.form).serviceRequirements ?? []).not.toHaveLength(0);
    }
  });

  it('maps bulk service rows into service requirements with row-level quantities', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      storageEnabled: false,
      databaseEnabled: false,
      cdn: false,
      loadBalancer: false,
      bulkServiceRows: [
        {
          id: 'bulk-1',
          serviceFamilyId: 'container-orchestration',
          quantity: '3',
          tier: 'production',
          note: 'shared platform cluster',
        },
      ],
    });

    expect(nws.sourceTraceability).toContainEqual({
      nwsPath: 'metadata.serviceCatalog',
      sourceRef: 'serviceCatalog:container-orchestration',
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'containers',
        serviceType: 'container-orchestration',
        quantity: 3,
        tier: 'production',
        scaleParams: expect.objectContaining({
          bulkImport: true,
          bulkQuantity: 3,
          bulkTier: 'production',
          bulkNote: 'shared platform cluster',
        }),
      }),
    );
  });

  it('serializes advanced networking assumptions only when they affect cost', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      crossAzTransferGb: '100',
      interRegionTransferGb: '200',
      cdnTrafficGb: '1000',
      cdnCacheHitRatioPercent: '80',
      cdnRequestsMillion: '20',
      natGatewayGb: '500',
      natGatewayHours: '730',
      dnsHostedZones: '2',
      dnsQueriesMillion: '3',
      loadBalancerProcessedGb: '250',
      loadBalancerHours: '730',
      loadBalancerNewConnectionsPerSecond: '75',
      loadBalancerActiveConnections: '9000',
      loadBalancerRuleEvaluationsPerSecond: '1500',
      vpnConnectionCount: '2',
      vpnConnectionHours: '730',
      vpnDataTransferGb: '1000',
      privateCircuitCount: '1',
      privateCircuitPortHours: '730',
      privateCircuitDataTransferGb: '2000',
    });

    expect(nws.network).toMatchObject({
      crossAzTransferGb: 100,
      interRegionTransferGb: 200,
      cdnTrafficGb: 1000,
      cdnCacheHitRatioPercent: 80,
      cdnRequestsMillion: 20,
      natGatewayGb: 500,
      natGatewayHours: 730,
      dnsHostedZones: 2,
      dnsQueriesMillion: 3,
      loadBalancerProcessedGb: 250,
      loadBalancerHours: 730,
      loadBalancerNewConnectionsPerSecond: 75,
      loadBalancerActiveConnections: 9000,
      loadBalancerRuleEvaluationsPerSecond: 1500,
      vpnConnectionCount: 2,
      vpnConnectionHours: 730,
      vpnDataTransferGb: 1000,
      privateCircuitCount: 1,
      privateCircuitPortHours: 730,
      privateCircuitDataTransferGb: 2000,
    });
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        vpnConnectionCount: '2',
        loadBalancerNewConnectionsPerSecond: '75',
        loadBalancerActiveConnections: '9000',
        loadBalancerRuleEvaluationsPerSecond: '1500',
        vpnConnectionHours: '730',
        vpnDataTransferGb: '1000',
        privateCircuitCount: '1',
        privateCircuitPortHours: '730',
        privateCircuitDataTransferGb: '2000',
      }),
    );
  });

  it('serializes AI and ML cost drivers into mapped service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      aiTrainingGpuHours: '180',
      aiModelHostingHours: '730',
      aiInferenceRequestsMillion: '25',
      aiVectorStorageGb: '500',
      aiVectorQueriesMillion: '10',
      aiApiInputTokensMillion: '80',
      aiApiOutputTokensMillion: '20',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'ai',
          serviceType: 'ml-platform',
          scaleParams: expect.objectContaining({
            aiTrainingGpuHours: 180,
            aiModelHostingHours: 730,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'ai',
          serviceType: 'ai-apis',
          scaleParams: expect.objectContaining({
            aiInferenceRequestsMillion: 25,
            aiVectorStorageGb: 500,
            aiVectorQueriesMillion: 10,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'ai',
          serviceType: 'generative-ai',
          scaleParams: expect.objectContaining({
            aiApiInputTokensMillion: 80,
            aiApiOutputTokensMillion: 20,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        aiTrainingGpuHours: '180',
        aiModelHostingHours: '730',
        aiInferenceRequestsMillion: '25',
        aiVectorStorageGb: '500',
        aiVectorQueriesMillion: '10',
        aiApiInputTokensMillion: '80',
        aiApiOutputTokensMillion: '20',
      }),
    );
  });

  it('serializes advanced storage assumptions only when they affect cost', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      storageClass: 'archive',
      monthlyPutRequestsThousand: '100',
      monthlyGetRequestsThousand: '250',
      monthlyDeleteRequestsThousand: '10',
      monthlyListRequestsThousand: '25',
      monthlyRetrievalGb: '40',
      objectCountThousand: '5000',
      objectRetentionDays: '30',
      storageReplication: 'cross-region',
      lifecycleTransitionsThousand: '20',
      snapshotSizeGb: '200',
      snapshotRetentionDays: '45',
      provisionedIops: '3000',
      provisionedThroughputMbps: '125',
      multiAttachEnabled: true,
    });

    expect(nws.storage[0]).toMatchObject({
      storageClass: 'archive',
      monthlyPutRequestsThousand: 100,
      monthlyGetRequestsThousand: 250,
      monthlyDeleteRequestsThousand: 10,
      monthlyListRequestsThousand: 25,
      monthlyRetrievalGb: 40,
      objectCountThousand: 5000,
      objectRetentionDays: 30,
      replication: 'cross-region',
      lifecycleTransitionsThousand: 20,
      snapshotSizeGb: 200,
      snapshotRetentionDays: 45,
      provisionedIops: 3000,
      provisionedThroughputMbps: 125,
      multiAttachEnabled: true,
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'storage',
        tier: 'archive',
        scaleParams: expect.objectContaining({
          storageClass: 'archive',
          monthlyPutRequestsThousand: 100,
          monthlyGetRequestsThousand: 250,
          monthlyRetrievalGb: 40,
          objectCountThousand: 5000,
          objectRetentionDays: 30,
          storageReplication: 'cross-region',
          snapshotSizeGb: 200,
          provisionedIops: 3000,
          provisionedThroughputMbps: 125,
          multiAttachEnabled: true,
        }),
      }),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        storageClass: 'archive',
        monthlyPutRequestsThousand: '100',
        monthlyGetRequestsThousand: '250',
        monthlyRetrievalGb: '40',
        objectCountThousand: '5000',
        objectRetentionDays: '30',
        storageReplication: 'cross-region',
        snapshotSizeGb: '200',
        snapshotRetentionDays: '45',
        provisionedIops: '3000',
        provisionedThroughputMbps: '125',
        multiAttachEnabled: true,
      }),
    );
  });

  it('serializes advanced database assumptions only when they affect cost', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      databaseEngine: 'generic_nosql',
      databaseSizeGb: '250',
      databaseBackupStorageGb: '120',
      databaseBackupRetentionDays: '45',
      databaseProvisionedIops: '3000',
      databaseReadReplicaCount: '2',
      databaseCrossRegionReplicaTransferGb: '150',
      databaseNosqlReadRequestUnitsMillion: '50',
      databaseNosqlWriteRequestUnitsMillion: '20',
      databaseRuPerSecond: '4000',
      databaseQueryDataTb: '8',
      databaseCacheReplicaCount: '1',
      databaseStorageGrowthGbPerMonth: '40',
    });

    expect(nws.database[0]).toMatchObject({
      engine: 'generic_nosql',
      sizeGb: 250,
      backupStorageGb: 120,
      backupRetentionDays: 45,
      provisionedIops: 3000,
      readReplicaCount: 2,
      crossRegionReplicaTransferGb: 150,
      nosqlReadRequestUnitsMillion: 50,
      nosqlWriteRequestUnitsMillion: 20,
      ruPerSecond: 4000,
      queryDataTb: 8,
      cacheReplicaCount: 1,
      storageGrowthGbPerMonth: 40,
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'database',
        serviceType: 'nosql-database',
        scaleParams: expect.objectContaining({
          backupStorageGb: 120,
          backupRetentionDays: 45,
          provisionedIops: 3000,
          readReplicaCount: 2,
          crossRegionReplicaTransferGb: 150,
          nosqlReadRequestUnitsMillion: 50,
          nosqlWriteRequestUnitsMillion: 20,
          ruPerSecond: 4000,
          queryDataTb: 8,
          cacheReplicaCount: 1,
          storageGrowthGbPerMonth: 40,
        }),
      }),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        databaseEngine: 'generic_nosql',
        databaseSizeGb: '250',
        databaseBackupStorageGb: '120',
        databaseBackupRetentionDays: '45',
        databaseProvisionedIops: '3000',
        databaseReadReplicaCount: '2',
        databaseCrossRegionReplicaTransferGb: '150',
        databaseNosqlReadRequestUnitsMillion: '50',
        databaseNosqlWriteRequestUnitsMillion: '20',
        databaseRuPerSecond: '4000',
        databaseQueryDataTb: '8',
        databaseCacheReplicaCount: '1',
        databaseStorageGrowthGbPerMonth: '40',
      }),
    );
  });

  it('serializes managed-search assumptions and restores them from NWS', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      databaseEngine: 'generic_nosql',
      databaseSizeGb: '500',
      databaseSearchNodeCount: '2',
      databaseSearchNodeHours: '730',
      databaseSearchStorageGb: '500',
      databaseSearchQueriesMillion: '25',
    });

    expect(nws.database[0]).toMatchObject({
      engine: 'generic_nosql',
      sizeGb: 500,
      searchNodeCount: 2,
      searchNodeHours: 730,
      searchStorageGb: 500,
      searchQueriesMillion: 25,
    });
    expect(nws.serviceRequirements).toContainEqual(
      expect.objectContaining({
        serviceCategory: 'database',
        serviceType: 'managed-search',
        instanceType: '2 search nodes - 500GB index',
        scaleParams: expect.objectContaining({
          searchNodeCount: 2,
          searchNodeHours: 730,
          searchStorageGb: 500,
          searchQueriesMillion: 25,
        }),
      }),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        databaseSearchNodeCount: '2',
        databaseSearchNodeHours: '730',
        databaseSearchStorageGb: '500',
        databaseSearchQueriesMillion: '25',
      }),
    );
  });

  it('serializes observability and secrets assumptions into service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      observabilityMetricsMillion: '10',
      observabilityLogsIngestGb: '50',
      observabilityLogRetentionGb: '100',
      observabilityAlarms: '5',
      observabilityDashboards: '2',
      observabilityTracesMillion: '4',
      secretsCount: '12',
      secretApiCallsTenThousand: '30',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'operations',
          serviceType: 'monitoring',
          scaleParams: expect.objectContaining({
            observabilityMetricsMillion: 10,
            observabilityAlarms: 5,
            observabilityDashboards: 2,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'operations',
          serviceType: 'logging-audit',
          scaleParams: expect.objectContaining({
            observabilityLogsIngestGb: 50,
            observabilityLogRetentionGb: 100,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'operations',
          serviceType: 'tracing-apm',
          scaleParams: expect.objectContaining({
            observabilityTracesMillion: 4,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'security',
          serviceType: 'keys-secrets',
          scaleParams: expect.objectContaining({
            secretsCount: 12,
            secretApiCallsTenThousand: 30,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        observabilityMetricsMillion: '10',
        observabilityLogsIngestGb: '50',
        observabilityLogRetentionGb: '100',
        observabilityAlarms: '5',
        observabilityDashboards: '2',
        observabilityTracesMillion: '4',
        secretsCount: '12',
        secretApiCallsTenThousand: '30',
      }),
    );
  });

  it('serializes security posture and WAF assumptions into service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      securityProtectedResources: '100',
      securityFindingsThousand: '25',
      wafWebAclCount: '2',
      wafRuleCount: '10',
      wafRequestsMillion: '80',
      ddosProtectedResources: '1',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'security',
          serviceType: 'security-posture',
          instanceType: 'security posture - 100 resources, 25K findings',
          tier: 'posture',
          scaleParams: expect.objectContaining({
            securityProtectedResources: 100,
            securityFindingsThousand: 25,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'security',
          serviceType: 'waf-ddos',
          instanceType: 'WAF + DDoS - 2 ACLs, 10 rules, 80M requests',
          tier: 'edge-protection',
          scaleParams: expect.objectContaining({
            wafWebAclCount: 2,
            wafRuleCount: 10,
            wafRequestsMillion: 80,
            ddosProtectedResources: 1,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        securityProtectedResources: '100',
        securityFindingsThousand: '25',
        wafWebAclCount: '2',
        wafRuleCount: '10',
        wafRequestsMillion: '80',
        ddosProtectedResources: '1',
      }),
    );
  });

  it('serializes serverless, app platform, and container runtime assumptions into service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      functionInvocationsMillion: '5',
      functionDurationMs: '200',
      functionMemoryMb: '512',
      appPlatformRequestsMillion: '10',
      appPlatformRequestDurationMs: '400',
      appPlatformVcpu: '1',
      appPlatformMemoryGb: '0.5',
      appPlatformAlwaysOnHours: '730',
      appPlatformMinInstances: '1',
      kubernetesClusterCount: '2',
      kubernetesWorkerNodeCount: '6',
      registryStorageGb: '40',
      registryEgressGb: '100',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'compute',
          serviceType: 'serverless-functions',
          scaleParams: expect.objectContaining({
            functionInvocationsMillion: 5,
            functionDurationMs: 200,
            functionMemoryMb: 512,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'application',
          serviceType: 'app-platform',
          scaleParams: expect.objectContaining({
            appPlatformRequestsMillion: 10,
            appPlatformRequestDurationMs: 400,
            appPlatformVcpu: 1,
            appPlatformMemoryGb: 0.5,
            appPlatformAlwaysOnHours: 730,
            appPlatformMinInstances: 1,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'containers',
          serviceType: 'container-orchestration',
          scaleParams: expect.objectContaining({
            kubernetesClusterCount: 2,
            kubernetesWorkerVcpu: 2,
            kubernetesWorkerMemoryGb: 4,
            kubernetesWorkerNodeCount: 6,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'containers',
          serviceType: 'container-registry',
          scaleParams: expect.objectContaining({
            registryStorageGb: 40,
            registryEgressGb: 100,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        functionInvocationsMillion: '5',
        functionDurationMs: '200',
        functionMemoryMb: '512',
        appPlatformRequestsMillion: '10',
        appPlatformRequestDurationMs: '400',
        appPlatformVcpu: '1',
        appPlatformMemoryGb: '0.5',
        appPlatformAlwaysOnHours: '730',
        appPlatformMinInstances: '1',
        kubernetesClusterCount: '2',
        kubernetesWorkerNodeCount: '6',
        registryStorageGb: '40',
        registryEgressGb: '100',
      }),
    );
  });

  it('serializes analytics platform assumptions into service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      analyticsWarehouseStorageGb: '500',
      analyticsWarehouseQueryTb: '20',
      analyticsDataLakeStorageGb: '5000',
      analyticsIntegrationJobHours: '120',
      analyticsStreamingIngestGb: '1000',
      analyticsBiUsers: '25',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'analytics',
          serviceType: 'data-warehouse',
          scaleParams: expect.objectContaining({
            analyticsWarehouseStorageGb: 500,
            analyticsWarehouseQueryTb: 20,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'analytics',
          serviceType: 'data-lake',
          scaleParams: expect.objectContaining({
            analyticsDataLakeStorageGb: 5000,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'analytics',
          serviceType: 'data-integration',
          scaleParams: expect.objectContaining({
            analyticsIntegrationJobHours: 120,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'analytics',
          serviceType: 'streaming-analytics',
          scaleParams: expect.objectContaining({
            analyticsStreamingIngestGb: 1000,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'analytics',
          serviceType: 'business-intelligence',
          scaleParams: expect.objectContaining({
            analyticsBiUsers: 25,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        analyticsWarehouseStorageGb: '500',
        analyticsWarehouseQueryTb: '20',
        analyticsDataLakeStorageGb: '5000',
        analyticsIntegrationJobHours: '120',
        analyticsStreamingIngestGb: '1000',
        analyticsBiUsers: '25',
      }),
    );
  });

  it('serializes integration and API gateway assumptions into service requirements', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: [],
      integrationQueueMessagesMillion: '50',
      integrationEventsMillion: '20',
      integrationWorkflowTransitionsThousand: '100',
      integrationApiGatewayRequestsMillion: '10',
    });

    expect(nws.serviceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCategory: 'integration',
          serviceType: 'queues-messaging',
          scaleParams: expect.objectContaining({
            integrationQueueMessagesMillion: 50,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'integration',
          serviceType: 'eventing',
          scaleParams: expect.objectContaining({
            integrationEventsMillion: 20,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'integration',
          serviceType: 'workflow-orchestration',
          scaleParams: expect.objectContaining({
            integrationWorkflowTransitionsThousand: 100,
          }),
        }),
        expect.objectContaining({
          serviceCategory: 'application',
          serviceType: 'api-gateway',
          scaleParams: expect.objectContaining({
            integrationApiGatewayRequestsMillion: 10,
          }),
        }),
      ]),
    );
    expect(formFromNws(nws)).toEqual(
      expect.objectContaining({
        integrationQueueMessagesMillion: '50',
        integrationEventsMillion: '20',
        integrationWorkflowTransitionsThousand: '100',
        integrationApiGatewayRequestsMillion: '10',
      }),
    );
  });

  it('maps an NWS back into editable form values', () => {
    const nws = buildNwsFromForm(defaultWorkloadForm, 'natural_language', 'web app');
    const form = formFromNws(nws);

    expect(form.workloadName).toBe(defaultWorkloadForm.workloadName);
    expect(form.regionPreference).toBe(defaultWorkloadForm.regionPreference);
    expect(form.dailyActiveUsers).toBe(defaultWorkloadForm.dailyActiveUsers);
    expect(form.databaseEngine).toBe(defaultWorkloadForm.databaseEngine);
    expect(form.environment).toBe(defaultWorkloadForm.environment);
    expect(form.supportTier).toBe(defaultWorkloadForm.supportTier);
    expect(form.processorArchitecture).toBe(defaultWorkloadForm.processorArchitecture);
    expect(form.computeTenancy).toBe(defaultWorkloadForm.computeTenancy);
    expect(form.faultTolerance).toBe(defaultWorkloadForm.faultTolerance);
    expect(form.cdnCacheHitRatioPercent).toBe(defaultWorkloadForm.cdnCacheHitRatioPercent);
    expect(form.natGatewayHours).toBe(defaultWorkloadForm.natGatewayHours);
    expect(form.loadBalancerHours).toBe(defaultWorkloadForm.loadBalancerHours);
    expect(form.selectedServiceCategory).toBe('compute');
    expect(form.selectedServiceFamilyId).toBe('vm-compute');
    expect(form.selectedServiceFamilyIds).toEqual(DEFAULT_SELECTED_SERVICE_FAMILY_IDS);
  });

  it('normalizes provider-specific region preferences into comparison regions', () => {
    expect(
      buildNwsFromForm({
        ...defaultWorkloadForm,
        regionPreference: 'eastus',
      }).workload.region,
    ).toEqual({
      preference: 'us-east',
      isDefault: false,
    });
  });

  it('constrains NWS region output when data residency lock is enabled', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      regionPreference: 'us-east',
      dataResidency: 'eu',
      complianceLocked: true,
    });

    expect(nws.workload.region).toEqual({
      preference: 'eu-west',
      isDefault: false,
    });
    expect(nws.serviceRequirements?.every((requirement) => requirement.region === 'eu-west')).toBe(
      true,
    );
  });

  it('flags invalid numeric form values before NWS generation can fall back silently', () => {
    expect(
      validateWorkloadForm({
        ...defaultWorkloadForm,
        vcpu: '0',
        memoryGb: '4abc',
        instanceCount: '2.5',
        storageSizeGb: '',
        monthlyEgressGb: '-1',
        crossAzTransferGb: '-1',
        interRegionTransferGb: '-1',
        cdnTrafficGb: '-1',
        cdnCacheHitRatioPercent: '101',
        cdnRequestsMillion: '-1',
        natGatewayGb: '-1',
        natGatewayHours: '731',
        dnsHostedZones: '1.5',
        dnsQueriesMillion: '-1',
        loadBalancerProcessedGb: '-1',
        loadBalancerHours: '731',
        loadBalancerNewConnectionsPerSecond: '-1',
        loadBalancerActiveConnections: '2.5',
        loadBalancerRuleEvaluationsPerSecond: '-1',
        vpnConnectionCount: '1.5',
        vpnConnectionHours: '731',
        vpnDataTransferGb: '-1',
        privateCircuitCount: '1.5',
        privateCircuitPortHours: '731',
        privateCircuitDataTransferGb: '-1',
        observabilityMetricsMillion: '-1',
        observabilityLogsIngestGb: '-1',
        observabilityLogRetentionGb: '-1',
        observabilityAlarms: '1.5',
        observabilityDashboards: '2.5',
        observabilityTracesMillion: '-1',
        secretsCount: '3.5',
        secretApiCallsTenThousand: '-1',
        securityProtectedResources: '2.5',
        securityFindingsThousand: '-1',
        wafWebAclCount: '1.5',
        wafRuleCount: '2.5',
        wafRequestsMillion: '-1',
        ddosProtectedResources: '1.5',
        analyticsWarehouseStorageGb: '-1',
        analyticsWarehouseQueryTb: '-1',
        analyticsDataLakeStorageGb: '-1',
        analyticsIntegrationJobHours: '-1',
        analyticsStreamingIngestGb: '-1',
        analyticsBiUsers: '1.5',
        aiTrainingGpuHours: '-1',
        aiModelHostingHours: '-1',
        aiInferenceRequestsMillion: '-1',
        aiVectorStorageGb: '-1',
        aiVectorQueriesMillion: '-1',
        aiApiInputTokensMillion: '-1',
        aiApiOutputTokensMillion: '-1',
        integrationQueueMessagesMillion: '-1',
        integrationEventsMillion: '-1',
        integrationWorkflowTransitionsThousand: '-1',
        integrationApiGatewayRequestsMillion: '-1',
        functionInvocationsMillion: '-1',
        functionDurationMs: '0',
        functionMemoryMb: '512.5',
        appPlatformRequestsMillion: '-1',
        appPlatformRequestDurationMs: '0',
        appPlatformVcpu: '0',
        appPlatformMemoryGb: '0',
        appPlatformAlwaysOnHours: '731',
        appPlatformMinInstances: '1.5',
        kubernetesClusterCount: '1.5',
        kubernetesWorkerNodeCount: '2.5',
        registryStorageGb: '-1',
        registryEgressGb: '-1',
        commitmentPreferencePercent: '101',
        usagePattern: 'scheduled',
        usageHoursPerDay: '0',
        usageDaysPerWeek: '8',
      }).map((issue) => issue.field),
    ).toEqual([
      'vcpu',
      'memoryGb',
      'instanceCount',
      'storageSizeGb',
      'analyticsWarehouseStorageGb',
      'analyticsWarehouseQueryTb',
      'analyticsDataLakeStorageGb',
      'analyticsIntegrationJobHours',
      'analyticsStreamingIngestGb',
      'analyticsBiUsers',
      'aiTrainingGpuHours',
      'aiModelHostingHours',
      'aiInferenceRequestsMillion',
      'aiVectorStorageGb',
      'aiVectorQueriesMillion',
      'aiApiInputTokensMillion',
      'aiApiOutputTokensMillion',
      'integrationQueueMessagesMillion',
      'integrationEventsMillion',
      'integrationWorkflowTransitionsThousand',
      'integrationApiGatewayRequestsMillion',
      'monthlyEgressGb',
      'crossAzTransferGb',
      'interRegionTransferGb',
      'cdnTrafficGb',
      'cdnCacheHitRatioPercent',
      'cdnRequestsMillion',
      'natGatewayGb',
      'natGatewayHours',
      'dnsHostedZones',
      'dnsQueriesMillion',
      'loadBalancerProcessedGb',
      'loadBalancerHours',
      'loadBalancerNewConnectionsPerSecond',
      'loadBalancerActiveConnections',
      'loadBalancerRuleEvaluationsPerSecond',
      'vpnConnectionCount',
      'vpnConnectionHours',
      'vpnDataTransferGb',
      'privateCircuitCount',
      'privateCircuitPortHours',
      'privateCircuitDataTransferGb',
      'observabilityMetricsMillion',
      'observabilityLogsIngestGb',
      'observabilityLogRetentionGb',
      'observabilityAlarms',
      'observabilityDashboards',
      'observabilityTracesMillion',
      'secretsCount',
      'secretApiCallsTenThousand',
      'securityProtectedResources',
      'securityFindingsThousand',
      'wafWebAclCount',
      'wafRuleCount',
      'wafRequestsMillion',
      'ddosProtectedResources',
      'functionInvocationsMillion',
      'functionDurationMs',
      'functionMemoryMb',
      'appPlatformRequestsMillion',
      'appPlatformRequestDurationMs',
      'appPlatformVcpu',
      'appPlatformMemoryGb',
      'appPlatformAlwaysOnHours',
      'appPlatformMinInstances',
      'kubernetesClusterCount',
      'kubernetesWorkerNodeCount',
      'registryStorageGb',
      'registryEgressGb',
      'commitmentPreferencePercent',
      'usageHoursPerDay',
      'usageDaysPerWeek',
    ]);
  });

  it('requires valid autoscaling ranges when autoscaling is selected', () => {
    expect(
      validateWorkloadForm({
        ...defaultWorkloadForm,
        scalingType: 'autoscaling',
        autoscaleMin: '4',
        autoscaleMax: '2',
      }),
    ).toContainEqual({
      field: 'autoscaleMax',
      message: 'Scale max must be greater than or equal to scale min.',
    });
  });

  it('round-trips selected cloud service families through NWS traceability', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      selectedServiceFamilyIds: ['generative-ai', 'data-warehouse', 'unknown-family'],
    });

    expect(nws.sourceTraceability).toEqual([
      {
        nwsPath: 'metadata.serviceCatalog',
        sourceRef: 'serviceCatalog:data-warehouse',
      },
      {
        nwsPath: 'metadata.serviceCatalog',
        sourceRef: 'serviceCatalog:generative-ai',
      },
    ]);
    expect(formFromNws(nws).selectedServiceFamilyIds).toEqual([
      'vm-compute',
      'object-storage',
      'relational-database',
      'data-warehouse',
      'generative-ai',
      'cdn-edge',
      'load-balancing',
    ]);
  });

  it('omits optional resources and falls back safely for sparse values', () => {
    const nws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: '',
      regionPreference: '',
      dailyActiveUsers: '',
      peakConcurrentUsers: '',
      vcpu: '',
      memoryGb: '',
      instanceCount: '',
      storageEnabled: false,
      databaseEnabled: false,
      monthlyEgressGb: '',
      slaTarget: '',
    });

    expect(nws.workload.name).toBeUndefined();
    expect(nws.workload.region).toEqual({ isDefault: true });
    expect(nws.workload.expectedUsers).toEqual({});
    expect(nws.compute[0]).toEqual({
      role: 'web',
      instanceFamily: 'general-purpose',
      processorArchitecture: 'x86_64',
      tenancy: 'shared',
      scalingType: 'fixed',
    });
    expect(nws.storage).toEqual([]);
    expect(nws.database).toEqual([]);
    expect(nws.network).toEqual({
      cdn: true,
      loadBalancer: true,
    });
  });

  it('maps sparse NWS values to default editable fields', () => {
    const sparse: NormalizedWorkloadSpec = {
      schemaVersion: '1.0',
      metadata: {
        sourceType: 'structured_form',
        createdAt: '2026-06-29T00:00:00.000Z',
      },
      workload: {
        type: 'other',
        region: {
          isDefault: true,
        },
      },
      compute: [],
      storage: [],
      database: [],
      network: {
        cdn: false,
        loadBalancer: false,
      },
      availability: {
        multiAz: false,
        multiRegion: false,
      },
    };

    const form = formFromNws(sparse);

    expect(form.workloadName).toBe(defaultWorkloadForm.workloadName);
    expect(form.computeRole).toBe(defaultWorkloadForm.computeRole);
    expect(form.storageEnabled).toBe(false);
    expect(form.databaseEnabled).toBe(false);
    expect(form.regionPreference).toBe('');
  });
});

describe('theme helpers', () => {
  it('resolves the initial system theme from the media query', () => {
    expect(systemTheme(() => ({ matches: true }))).toBe('dark');
    expect(systemTheme(() => ({ matches: false }))).toBe('light');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('system', () => ({ matches: true }))).toBe('dark');
    expect(resolveTheme('system', () => ({ matches: false }))).toBe('light');
  });

  it('reads, writes, and applies theme choices', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => storage.set(key, value)),
    };
    const root = document.createElement('html');

    expect(storedTheme(storageLike)).toBe('system');
    storage.set(THEME_STORAGE_KEY, 'dark');
    expect(storedTheme(storageLike)).toBe('dark');
    storage.set(THEME_STORAGE_KEY, 'system');
    expect(storedTheme(storageLike)).toBe('system');

    const resolved = applyTheme('system', root, storageLike, () => ({ matches: true }));

    expect(resolved).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.themeChoice).toBe('system');
    expect(root.style.colorScheme).toBe('dark');
    expect(storageLike.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'system');
  });

  it('subscribes to live system theme changes', () => {
    let listener: (() => void) | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener: jest.fn((_event: string, nextListener: () => void) => {
        listener = nextListener;
      }),
      removeEventListener: jest.fn(),
    };
    const onChange = jest.fn();

    const unsubscribe = subscribeToSystemTheme(onChange, () => mediaQuery);
    mediaQuery.matches = true;
    listener?.();
    unsubscribe();

    expect(onChange).toHaveBeenCalledWith('dark');
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
