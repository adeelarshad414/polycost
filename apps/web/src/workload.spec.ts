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
import { buildNwsFromForm, defaultWorkloadForm, formFromNws } from './workload';

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
    expect(nws.sourceTraceability).toContainEqual({
      nwsPath: 'metadata.serviceCatalog',
      sourceRef: 'serviceCatalog:vm-compute',
    });
    expect(nws.sourceTraceability).toContainEqual({
      nwsPath: 'metadata.serviceCatalog',
      sourceRef: 'serviceCatalog:object-storage',
    });
  });

  it('maps an NWS back into editable form values', () => {
    const nws = buildNwsFromForm(defaultWorkloadForm, 'natural_language', 'web app');
    const form = formFromNws(nws);

    expect(form.workloadName).toBe(defaultWorkloadForm.workloadName);
    expect(form.regionPreference).toBe(defaultWorkloadForm.regionPreference);
    expect(form.dailyActiveUsers).toBe(defaultWorkloadForm.dailyActiveUsers);
    expect(form.databaseEngine).toBe(defaultWorkloadForm.databaseEngine);
    expect(form.selectedServiceFamilyIds).toEqual(DEFAULT_SELECTED_SERVICE_FAMILY_IDS);
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
    expect(formFromNws(nws).selectedServiceFamilyIds).toEqual(['data-warehouse', 'generative-ai']);
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
