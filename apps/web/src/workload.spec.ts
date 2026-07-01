import {
  applyTheme,
  resolveTheme,
  storedTheme,
  subscribeToSystemTheme,
  systemTheme,
  THEME_STORAGE_KEY,
} from './theme';
import { DEFAULT_SELECTED_SERVICE_FAMILY_IDS } from './service-catalog';
import { NormalizedWorkloadSpec } from './types';
import {
  ARCHITECTURE_TEMPLATES,
  buildNwsFromForm,
  defaultWorkloadForm,
  formFromNws,
  validateWorkloadForm,
} from './workload';

describe('workload helpers', () => {
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
        }),
        expect.objectContaining({
          serviceCategory: 'database',
          serviceType: 'relational-database',
          tier: 'high-availability',
        }),
      ]),
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

  it('maps an NWS back into editable form values', () => {
    const nws = buildNwsFromForm(defaultWorkloadForm, 'natural_language', 'web app');
    const form = formFromNws(nws);

    expect(form.workloadName).toBe(defaultWorkloadForm.workloadName);
    expect(form.regionPreference).toBe(defaultWorkloadForm.regionPreference);
    expect(form.dailyActiveUsers).toBe(defaultWorkloadForm.dailyActiveUsers);
    expect(form.databaseEngine).toBe(defaultWorkloadForm.databaseEngine);
    expect(form.environment).toBe(defaultWorkloadForm.environment);
    expect(form.supportTier).toBe(defaultWorkloadForm.supportTier);
    expect(form.faultTolerance).toBe(defaultWorkloadForm.faultTolerance);
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

  it('flags invalid numeric form values before NWS generation can fall back silently', () => {
    expect(
      validateWorkloadForm({
        ...defaultWorkloadForm,
        vcpu: '0',
        memoryGb: '4abc',
        instanceCount: '2.5',
        storageSizeGb: '',
        monthlyEgressGb: '-1',
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
      'monthlyEgressGb',
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
  });

  it('reads, writes, and applies theme choices', () => {
    const storage = new Map<string, string>();
    const storageLike = {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => storage.set(key, value)),
    };
    const root = document.createElement('html');

    expect(storedTheme(storageLike, () => ({ matches: true }))).toBe('dark');
    storage.set(THEME_STORAGE_KEY, 'dark');
    expect(storedTheme(storageLike)).toBe('dark');

    const resolved = applyTheme('light', root, storageLike);

    expect(resolved).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.themeChoice).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(storageLike.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
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
