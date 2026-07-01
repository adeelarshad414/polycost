import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App, ComparisonView } from './App';
import { PolyCostClient, PolyCostApiError } from './api-client';
import {
  BackendHealthResponse,
  ComparisonResult,
  DataHealthResponse,
  ParsedNwsDraft,
  PricingStatusResponse,
  RegionCatalogResponse,
  ReportExportJobResponse,
} from './types';
import { intervalMultiplierFromMonthly } from './cost-time';
import { buildNwsFromForm, defaultWorkloadForm } from './workload';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const comparisonResult: ComparisonResult = {
  comparisonId: '11111111-1111-4111-8111-111111111111',
  pricingAsOf: '2026-06-29T00:00:00.000Z',
  cheapestProviderId: 'gcp',
  providers: [provider('aws', 42), provider('azure', 38), provider('gcp', 30, true)],
};

describe('App', () => {
  const originalCreateObjectUrl = window.URL.createObjectURL;
  const originalRevokeObjectUrl = window.URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
    window.localStorage.removeItem('polycost-comparison-history-v1');
    window.sessionStorage.removeItem('polycost-current-requirements-v1');
    window.URL.createObjectURL = jest.fn(() => 'blob:polycost-report');
    window.URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectUrl;
    window.URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themeChoice = 'light';
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
    window.localStorage.removeItem('polycost-comparison-history-v1');
    window.sessionStorage.removeItem('polycost-current-requirements-v1');
  });

  it('runs the structured-form comparison flow', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(container, 'Guided form').getAttribute('aria-selected')).toBe('true');
    expect(buttonByText(container, 'Paste / parse').getAttribute('aria-selected')).toBe('false');
    expect(buttonByText(container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('.landing-comparison')).toBeNull();
    expect(container.querySelector('.comparison-toolbar')).toBeNull();
    expect(container.querySelector('.workbench-results')).toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('.initial-optional-estimate')?.open).toBe(
      false,
    );

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('Requirements');
    expect(text(container)).toContain('Manual entry');
    expect(text(container)).toContain(
      'Web app · Virtual machines · 2 vCPU · 4GB · US East (AWS us-east-1 · Azure eastus · GCP us-east1)',
    );
    expect(text(container)).toContain('Best value');
    expect(text(container)).toContain('Monthly estimate');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
    expect(Array.from(container.querySelectorAll<HTMLElement>('.result-disclosure'))).toHaveLength(
      1,
    );
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('.result-disclosure')).every(
        (details) => details.dataset.open === 'false' && details.dataset.mounted === 'false',
      ),
    ).toBe(true);
    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: '1.0',
        workload: expect.objectContaining({ type: 'web_app' }),
        compute: [expect.objectContaining({ instanceCount: 1, memoryGb: 4, vcpu: 2 })],
        storage: [],
      }),
    );
    expect(client.createComparison).toHaveBeenCalled();
    expect(text(container)).not.toContain('Comparison ready.');
    expect(text(container)).toContain('AWS');
    expect(text(container)).toContain('Azure');
    expect(text(container)).toContain('GCP');
    expect(
      JSON.parse(window.localStorage.getItem('polycost-comparison-history-v1') ?? '[]')[0],
    ).toMatchObject({
      comparisonId: comparisonResult.comparisonId,
      cheapestProviderId: 'gcp',
      providerCount: 3,
    });
    expect(text(container)).toContain('Executive monthly baseline');
    expect(text(container)).toContain('Provider mix');
    expect(text(container)).toContain('Cost composition waterfall');
    expect(text(container)).toContain('Compute base');
    expect(text(container)).toContain('Pricing model comparison');
    expect(text(container)).toContain('On-demand vs commitments');
    expect(text(container)).toContain('Break-even timeline');
    expect(text(container)).toContain('Commitment data pending');
    expect(container.querySelectorAll('.executive-provider-card')).toHaveLength(3);
    expect(container.querySelector('.executive-pricing-bars')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('.executive-break-even-card')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('Trend pending');
    expect(container.querySelector('.recharts-wrapper')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('Show full breakdown, pricing models & export options');
    expect(text(container)).toContain('Engineering service spend');
    expect(text(container)).toContain('Cost-by-service concentration');
    expect(text(container)).not.toContain('Cost periods & executive analytics');
    expect(text(container)).not.toContain('Pricing models, breakdown, budget & share');
    expect(text(container)).not.toContain('Architecture & engineering evidence');
    expect(text(container)).not.toContain('Official calculators & regions');
    expect(text(container)).not.toContain('Export report');
    expect(text(container)).not.toContain('GCP is the current executive cost baseline');
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]'),
    ).toBeNull();
    expect(text(container)).not.toContain('Resource name');
    expect(text(container)).not.toContain('Spec / SKU');
    expect(text(container)).not.toContain('Export CSV');
    expect(text(container)).not.toContain('API JSON');
    expect(text(container)).not.toContain('SKU/spec pending API field');

    unmount();
  });

  it('applies quick-start architecture templates to the structured form', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    expect(text(container)).toContain('Quick starts');
    await click(templateButtonByText(container, 'Microservices'));

    expect(inputById(container, 'vcpu').value).toBe('4');
    expect(inputById(container, 'memory-gb').value).toBe('16');

    await click(buttonByText(container, 'Compare costs'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Microservices platform',
          type: 'api_backend',
        }),
        serviceRequirements: expect.arrayContaining([
          expect.objectContaining({
            serviceType: 'container-orchestration',
          }),
          expect.objectContaining({
            serviceType: 'cicd',
          }),
        ]),
      }),
    );

    unmount();
  });

  it('adopts the backend pricing model recommendation after comparison', async () => {
    const recommendedResult: ComparisonResult = {
      ...comparisonResult,
      pricingModelRecommendation: {
        preferredModel: 'reserved-3yr',
        confidence: 'high',
        rationale:
          'Defaulting to 3-year reserved pricing because this is a production workload with 90% commitment preference and all priced providers expose comparable long-term commitment data.',
        sourceSignals: {
          environment: 'production',
          commitmentPreferencePercent: 90,
          flexibilityBias: 'cost-optimized',
        },
      },
    };
    const client = clientMock({
      createComparison: jest.fn(async () => recommendedResult),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    expect(window.localStorage.getItem('polycost-pricing-model')).toBe('reserved-3yr');
    expect(text(container)).toContain('Recommended scenario');
    expect(text(container)).toContain('Reserved 3yr');
    expect(text(container)).toContain('Production');
    expect(text(container)).toContain('90% commitment');
    expect(
      JSON.parse(window.localStorage.getItem('polycost-comparison-history-v1') ?? '[]')[0],
    ).toMatchObject({
      pricingModel: 'reserved-3yr',
    });

    unmount();
  });

  it('restores recent comparison history into the guided form', async () => {
    window.localStorage.setItem(
      'polycost-comparison-history-v1',
      JSON.stringify([
        {
          id: 'history-1',
          comparisonId: 'history-1',
          createdAt: '2026-07-01T08:30:00.000Z',
          form: {
            ...defaultWorkloadForm,
            workloadName: 'Restored API',
            workloadType: 'api_backend',
            vcpu: '8',
            memoryGb: '32',
            selectedServiceCategory: 'compute',
            selectedServiceFamilyId: 'vm-compute',
          },
          inputMode: 'describe',
          pricingModel: 'reserved-1yr',
          cheapestProviderId: 'azure',
          serviceCount: 2,
          providerCount: 3,
          monthlyLowestUsd: 123.45,
          summary: 'Restored API · API backend',
        },
      ]),
    );
    const { container, unmount } = render(<App client={clientMock()} />);

    expect(text(container)).toContain('Recent comparisons');
    await click(comparisonHistoryButtonByText(container, 'Restored API'));

    expect(buttonByText(container, 'Guided form').getAttribute('aria-selected')).toBe('true');
    expect(inputById(container, 'vcpu').value).toBe('8');
    expect(inputById(container, 'memory-gb').value).toBe('32');
    expect(window.localStorage.getItem('polycost-pricing-model')).toBe('reserved-1yr');
    expect(text(container)).toContain(
      'Loaded Restored API · API backend. Compare again to refresh pricing.',
    );

    unmount();
  });

  it('blocks invalid guided form values before backend comparison', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeInput(inputById(container, 'vcpu'), '0');
    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('Fix 1 requirement field before comparing.');
    expect(text(container)).toContain('vCPU must be greater than 0.');
    expect(inputById(container, 'vcpu').getAttribute('aria-invalid')).toBe('true');
    expect(client.validateWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).not.toHaveBeenCalled();

    unmount();
  });

  it('updates the page scroll progress indicator', async () => {
    const originalInnerHeight = window.innerHeight;
    const originalScrollY = window.scrollY;
    const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'scrollHeight',
    );
    const { container, unmount } = render(<App client={clientMock()} />);

    try {
      expect(container.querySelector('[aria-label="Page scroll progress"]')).toBeNull();

      await click(buttonByText(container, 'Compare costs'));

      Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: 2000,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 1000,
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: 500,
      });

      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
      });

      const progress = container.querySelector('[aria-label="Page scroll progress"]');
      const bar = container.querySelector('.scroll-progress-bar');

      expect(progress).toBeInstanceOf(HTMLElement);
      expect(progress?.getAttribute('role')).toBe('progressbar');
      expect(progress?.getAttribute('aria-valuenow')).toBe('50');
      expect((bar as HTMLElement).style.transform).toBe('scaleX(0.5)');
    } finally {
      unmount();
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: originalScrollY,
      });

      if (originalScrollHeightDescriptor) {
        Object.defineProperty(
          document.documentElement,
          'scrollHeight',
          originalScrollHeightDescriptor,
        );
      } else {
        Reflect.deleteProperty(document.documentElement, 'scrollHeight');
      }
    }
  });

  it('keeps relocated features functional inside a single accessible detail gate', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    const disclosures = Array.from(container.querySelectorAll<HTMLElement>('.result-disclosure'));
    expect(disclosures).toHaveLength(1);
    expect(
      disclosures.every(
        (details) => details.dataset.open === 'false' && details.dataset.mounted === 'false',
      ),
    ).toBe(true);
    expect(
      disclosures.every(
        (details) =>
          disclosureSummary(details).getAttribute('aria-expanded') === 'false' &&
          Boolean(
            document.getElementById(disclosureSummary(details).getAttribute('aria-controls') ?? ''),
          ),
      ),
    ).toBe(true);

    const detailGate = resultDisclosureByTitle(
      container,
      'Show full breakdown, pricing models & export options',
    );
    await click(disclosureSummary(detailGate));
    expect(detailGate.dataset.open).toBe('true');
    expect(detailGate.dataset.mounted).toBe('true');
    expect(disclosureSummary(detailGate).getAttribute('aria-expanded')).toBe('true');
    expect(detailGate.querySelector('.result-disclosure-panel')?.getAttribute('aria-hidden')).toBe(
      'false',
    );
    expect(text(container)).toContain('Executive decision brief');
    expect(text(container)).toContain('Export summary');
    expect(detailGate.dataset.open).toBe('true');
    expect(text(container)).toContain('Engineering cost controls');
    expect(text(container)).toContain('Engineering service spend');
    expect(text(container)).toContain('Service driver split');
    expect(text(container)).toContain('EC2');
    expect(text(container)).toContain('VM');
    expect(text(container)).toContain('GCE');
    expect(text(container)).toContain('Filter by tag');

    await click(buttonByText(container, 'Yearly'));
    expect(text(container)).toContain('Yearly estimate');

    await click(buttonByText(container, 'Hourly'));
    expect(text(container)).toContain('Hourly estimate');

    await click(buttonByText(container, '1yr reserved'));
    expect(buttonByText(container, '1yr reserved').getAttribute('aria-pressed')).toBe('true');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain(
      'Create a real read-only report link scoped to this workload, pricing model, and time granularity.',
    );
    await click(buttonByText(detailGate, 'Create & copy link'));
    expect(client.createWorkload).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-east' }),
    );
    expect(client.createShareLink).toHaveBeenCalledWith({
      workloadId: '22222222-2222-4222-8222-222222222222',
      watermark: true,
      expiresInDays: 30,
      pricingModel: 'reserved-1yr',
      granularity: 'hourly',
    });
    expect(text(container)).toContain('Public report ready.');

    await changeInput(inputById(container, 'budget-threshold-usd'), '10');
    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    await click(buttonByText(container, 'Dismiss'));
    expect(text(container)).not.toContain('Estimated run-rate exceeds budget threshold.');

    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('API JSON');

    expect(
      container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]'),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://cloud.google.com/compute/docs/regions-zones"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);

    await click(buttonByText(container, 'PDF'));
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf', {
      interval: 'hourly',
      pricingModel: 'reserved-1yr',
    });

    expect(detailGate.dataset.open).toBe('true');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
    expect(text(container)).toContain('Executive decision brief');
    expect(text(container)).toContain('Export summary');
    expect(text(container)).toContain('Filter by tag');

    await click(disclosureSummary(detailGate));
    expect(detailGate.dataset.open).toBe('false');
    expect(detailGate.dataset.mounted).toBe('true');
    expect(detailGate.querySelector('.result-disclosure-panel')?.getAttribute('aria-hidden')).toBe(
      'true',
    );

    unmount();
  });

  it('shows loading spinners while compare, refresh, and export actions are pending', async () => {
    const validateDeferred = deferred<{ valid: true }>();
    const refreshDeferred = deferred<ComparisonResult>();
    const exportDeferred = deferred<Blob>();
    const client = clientMock({
      validateWorkload: jest.fn(() => validateDeferred.promise),
      refreshLiveComparison: jest.fn(() => refreshDeferred.promise),
      exportComparison: jest.fn(() => exportDeferred.promise),
    });
    const { container, unmount } = render(<App client={client} />);

    try {
      await click(buttonByText(container, 'Compare costs'));

      expect(
        buttonByText(container, 'Comparing costs...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      validateDeferred.resolve({ valid: true });
      await act(async () => {
        await validateDeferred.promise;
      });

      await click(
        disclosureSummary(
          resultDisclosureByTitle(
            container,
            'Show full breakdown, pricing models & export options',
          ),
        ),
      );
      await click(buttonByText(container, 'Refresh live'));

      expect(
        buttonByText(container, 'Refreshing...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      refreshDeferred.resolve(comparisonResult);
      await act(async () => {
        await refreshDeferred.promise;
      });

      await click(buttonByText(container, 'PDF'));

      expect(
        buttonByText(container, 'Generating PDF...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      exportDeferred.resolve(new Blob(['report']));
      await act(async () => {
        await exportDeferred.promise;
      });
    } finally {
      unmount();
    }
  });

  it('shows quick refresh API errors on the results page', async () => {
    const client = clientMock({
      refreshLiveComparison: jest.fn(async () => {
        throw new PolyCostApiError(
          503,
          'live_refresh_failed',
          'Live pricing refresh is temporarily unavailable.',
        );
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await click(buttonByText(container, 'Refresh live'));

    expect(client.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(text(container)).toContain('Live pricing refresh is temporarily unavailable.');

    unmount();
  });

  it('clears requirements input and rendered cost breakdowns', async () => {
    const refreshDeferred = deferred<ComparisonResult>();
    const client = clientMock({
      refreshLiveComparison: jest.fn(() => refreshDeferred.promise),
    });
    const { container, unmount } = render(<App client={client} />);

    expect(container.querySelector('#natural-language-input')).toBeNull();

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).not.toContain('Comparison ready.');
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    await click(
      disclosureSummary(
        resultDisclosureByTitle(container, 'Show full breakdown, pricing models & export options'),
      ),
    );
    expect(buttonByText(container, 'Refresh live').disabled).toBe(false);
    expect(buttonByText(container, 'PDF').disabled).toBe(false);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);

    await click(buttonByText(container, 'Refresh live'));

    await click(buttonByText(container, 'Clear'));

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('.requirement-summary-strip')).toBeNull();
    expect(container.querySelector('.workbench-results')).toBeNull();
    expect(container.querySelector('.provider-summary-card')).toBeNull();
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(text(container)).not.toContain('$42.00');

    refreshDeferred.resolve({
      ...comparisonResult,
      comparisonId: 'stale-refresh-after-clear',
    });
    await act(async () => {
      await refreshDeferred.promise;
    });

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(container.querySelector('.provider-summary-card')).toBeNull();
    expect(container.querySelector('.result-disclosure')).toBeNull();

    unmount();

    const reloaded = render(<App client={client} />);
    expect(text(reloaded.container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(reloaded.container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(reloaded.container.querySelector('.provider-summary-card')).toBeNull();
    expect(reloaded.container.querySelector('.result-disclosure')).toBeNull();
    reloaded.unmount();
  });

  it('supports form edits, interval changes, refresh, and export', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'workload-type'), 'api_backend');
    await changeSelect(selectById(container, 'region'), 'us-west-2');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await click(buttonByText(container, 'Compare costs'));

    await click(buttonByText(container, 'Edit'));

    expect(container.querySelector('.requirement-summary-strip')).toBeNull();
    expect(container.querySelector('.requirements-edit-panel')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(selectById(container, 'type').value).toBe('api_backend');
    expect(selectById(container, 'region').value).toBe('us-west-2');
    expect(inputById(container, 'vcpu').value).toBe('4');
    expect(inputById(container, 'memory-gb').value).toBe('8');

    await changeInput(inputById(container, 'name'), 'Edited portal');
    await changeInput(inputById(container, 'daily-users'), '7000');
    await changeInput(inputById(container, 'peak-users'), '800');
    await changeInput(inputById(container, 'compute-role'), 'api');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await changeInput(inputById(container, 'instances'), '3');
    await changeSelect(selectById(container, 'scaling'), 'autoscaling');
    await changeInput(inputById(container, 'scale-min'), '2');
    await changeInput(inputById(container, 'scale-max'), '8');
    await click(serviceFamilyCheckboxByLabel(container, 'Generative AI'));
    await click(checkboxByLabel(container, 'Object storage'));
    await click(checkboxByLabel(container, 'Managed database'));
    await click(checkboxByLabel(container, 'CDN'));
    await click(checkboxByLabel(container, 'Load balancer'));
    await click(checkboxByLabel(container, 'Multi-region'));
    await changeInput(inputById(container, 'storage-role'), 'media uploads');
    await changeInput(inputById(container, 'storage-gb'), '512');
    await changeSelect(selectById(container, 'storage-type'), 'file');
    await changeSelect(selectById(container, 'access-pattern'), 'archive');
    await changeInput(inputById(container, 'database-role'), 'orders');
    await changeSelect(selectById(container, 'database'), 'mysql');
    await changeInput(inputById(container, 'database-gb'), '200');
    await click(checkboxByLabel(container, 'Database HA'));
    await changeInput(inputById(container, 'egress-gb-mo'), '900');
    await changeInput(inputById(container, 'sla-target'), '99.95%');

    await click(buttonByText(container, 'Compare'));
    const detailGate = resultDisclosureByTitle(
      container,
      'Show full breakdown, pricing models & export options',
    );
    await click(disclosureSummary(detailGate));
    await click(buttonByText(container, 'Yearly'));
    await click(buttonByText(container, 'Refresh live'));
    await click(buttonByText(container, 'PDF'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Edited portal',
          type: 'api_backend',
        }),
        storage: [
          expect.objectContaining({
            accessPattern: 'archive',
            role: 'media uploads',
            type: 'file',
          }),
        ],
        database: [
          expect.objectContaining({
            engine: 'mysql',
            highAvailability: false,
            role: 'orders',
          }),
        ],
        sourceTraceability: expect.arrayContaining([
          {
            nwsPath: 'metadata.serviceCatalog',
            sourceRef: 'serviceCatalog:generative-ai',
          },
        ]),
      }),
    );
    expect(client.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf', {
      interval: 'yearly',
      pricingModel: 'on-demand',
    });

    unmount();
  });

  it('imports bulk service rows into the editable guided form', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    await click(buttonByText(container, 'Edit'));

    await changeTextarea(
      textareaById(container, 'bulk-service-input'),
      'Managed Kubernetes, 3, production, shared platform cluster\nS3, 2, standard',
    );

    expect(text(container)).toContain('Bulk service import');
    expect(text(container)).toContain('Managed Kubernetes');
    expect(text(container)).toContain('Object storage');

    await click(buttonByText(container, 'Add matched services'));

    expect(text(container)).toContain('Imported rows');
    expect(text(container)).toContain('Managed Kubernetes');

    await click(buttonByText(container, 'Compare'));

    expect(client.validateWorkload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        serviceRequirements: expect.arrayContaining([
          expect.objectContaining({
            serviceCategory: 'containers',
            serviceType: 'container-orchestration',
            quantity: 3,
            tier: 'production',
            scaleParams: expect.objectContaining({
              bulkImport: true,
              bulkNote: 'shared platform cluster',
            }),
          }),
          expect.objectContaining({
            serviceCategory: 'storage',
            serviceType: 'object-storage',
            quantity: 2,
            tier: 'standard',
          }),
        ]),
      }),
    );

    unmount();
  });

  it('hides submitted results while editing draft requirements', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'workload-type'), 'api_backend');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('API backend · Virtual machines · 4 vCPU · 8GB');

    await click(buttonByText(container, 'Edit'));
    await changeInput(inputById(container, 'vcpu'), '16');
    await changeInput(inputById(container, 'memory-gb'), '64');

    expect(container.querySelector('.requirements-edit-panel')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(text(container)).not.toContain('$42.00');

    await click(buttonByText(container, 'Compare'));

    expect(container.querySelector('.requirements-edit-panel')).toBeNull();
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('API backend · Virtual machines · 16 vCPU · 64GB');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);

    unmount();
  });

  it('parses describe input before creating a comparison', async () => {
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Parsed and compared portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'medium' as const,
        fieldsRequiringReview: ['database[0].sizeGb'],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse requirements'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('web app'));
    expect(client.validateWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).not.toHaveBeenCalled();
    expect(text(container)).toContain('Review checkpoint');
    expect(text(container)).toContain('Interpreted services ready to price');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).toContain('Parsed with medium confidence. Review 1 field.');

    await click(buttonByText(container, 'Confirm & compare'));

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ sourceType: 'structured_form' }),
        workload: expect.objectContaining({
          name: 'Parsed and compared portal',
        }),
      }),
    );
    expect(client.createComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          name: 'Parsed and compared portal',
        }),
      }),
    );
    expect(text(container)).toContain('Parsed from text');

    await click(buttonByText(container, 'Edit'));
    expect(buttonByText(container, 'Paste / parse').getAttribute('aria-selected')).toBe('true');
    expect(textareaById(container, 'natural-language-input').value).toContain('web app');

    await click(buttonByText(container, 'Guided form'));
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).not.toContain('Comparison ready.');

    unmount();
  });

  it('loads a requirements file into the same parse and review flow', async () => {
    const fileText =
      'Client requirements: web app with 4 app servers, managed Postgres, 500GB object storage, and 1TB egress in US East.';
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Uploaded requirements portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'high' as const,
        fieldsRequiringReview: [],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    const file = new File([fileText], 'client-requirements.md', { type: 'text/markdown' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => fileText),
    });

    await changeFileInput(inputById(container, 'requirements-file-input'), file);

    expect(textareaById(container, 'natural-language-input').value).toContain('managed Postgres');
    expect(text(container)).toContain('Loaded from client-requirements.md');
    expect(text(container)).toContain(
      'Loaded client-requirements.md. Review the text, then parse requirements.',
    );

    await click(buttonByText(container, 'Parse requirements'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('1TB egress'));
    expect(text(container)).toContain('Review checkpoint');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Uploaded requirements portal',
    );

    unmount();
  });

  it('keeps structured CSV and diagram imports behind the Phase 2 parser hook', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    const file = new File(['service,quantity\ncompute,4'], 'architecture.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: jest.fn(async () => 'service,quantity\ncompute,4'),
    });

    await changeFileInput(inputById(container, 'requirements-file-input'), file);

    expect(text(container)).toContain(
      'Upload a plain text, Markdown, JSON, or YAML requirements file.',
    );
    expect(client.parseWorkload).not.toHaveBeenCalled();
    expect(textareaById(container, 'natural-language-input').value).toContain('web app');

    unmount();
  });

  it('parses natural-language input into the editable form', async () => {
    const parsedNws = buildNwsFromForm({
      ...defaultWorkloadForm,
      workloadName: 'Parsed portal',
    });
    const client = clientMock({
      parseWorkload: jest.fn(async () => ({
        draftNws: parsedNws,
        parserConfidence: 'high' as const,
        fieldsRequiringReview: ['compute[0].instanceCount'],
      })),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));
    clearClientCalls(client);
    await click(buttonByText(container, 'Edit'));
    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse'));

    expect(text(container)).toContain('Parsed with high confidence');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe('Parsed portal');

    unmount();
  });

  it('renders API errors without clearing the dashboard', async () => {
    const client = clientMock({
      createComparison: jest.fn(async () => {
        throw new PolyCostApiError(503, 'PRICING_UNAVAILABLE', 'No pricing available');
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('No pricing available');

    unmount();
  });

  it('renders parse errors without exposing admin-only pricing diagnostics', async () => {
    const client = clientMock({
      parseWorkload: jest.fn(async () => {
        throw new PolyCostApiError(422, 'WORKLOAD_PARSE_ERROR', 'Input was not understood');
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Paste / parse'));
    await click(buttonByText(container, 'Parse requirements'));

    expect(text(container)).toContain('Input was not understood');
    expect(container.querySelector('.initial-home-form')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(text(container)).not.toContain('Monthly estimate');
    expect(text(container)).not.toContain('Pricing status restricted');

    unmount();
  });
});

describe('ComparisonView', () => {
  beforeEach(() => {
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
  });

  afterEach(() => {
    window.localStorage.removeItem('polycost-persona-view');
    window.localStorage.removeItem('polycost-dismissed-budget-alerts');
  });

  it('renders an empty pre-comparison state without pricing failure language', () => {
    const { container, unmount } = render(<ComparisonView comparison={null} interval="monthly" />);

    expect(mobileProviderLabels(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Pending');
    expect(text(container)).toContain('Run a comparison to populate AWS service bars.');
    expect(text(container)).not.toContain('Pricing unavailable');

    unmount();
  });

  it('keeps provider order stable and marks unavailable providers', () => {
    const partialResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [provider('azure', 20)],
    };
    const { container, unmount } = render(
      <ComparisonView comparison={partialResult} interval="monthly" />,
    );

    expect(mobileProviderLabels(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Unavailable');
    expect(text(container)).toContain('Shortlist Azure');
    expect(text(container)).toContain('Trend data not yet available');

    unmount();
  });

  it('renders executive persona metrics and engineering resource rows from shared costs', async () => {
    const { container, unmount } = render(
      <ComparisonView comparison={comparisonResult} interval="monthly" />,
    );

    expect(text(container)).toContain('$30.00');
    expect(text(container)).toContain('Executive monthly baseline');
    expect(text(container)).toContain('Provider mix');
    expect(text(container)).toContain('$110.00');
    expect(text(container)).toContain('90-day forecast');
    expect(text(container)).toContain('Trend data not yet available');
    expect(text(container)).toContain('Shortlist GCP');
    expect(text(container)).toContain('$360.00');
    expect(text(container)).toContain('$144.00');

    expect(text(container)).toContain('Service driver split');
    expect(text(container)).toContain('EC2');
    expect(text(container)).toContain('VM');
    expect(text(container)).toContain('GCE');
    expect(
      container.querySelectorAll('.engineering-bar-chart-shell .recharts-wrapper').length,
    ).toBeGreaterThanOrEqual(3);
    expect(text(container)).toContain('Filter by tag');
    expect(text(container)).toContain('Backend contract note');
    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('Spec / SKU');
    expect(text(container)).toContain('aws-compute-01');
    expect(text(container)).toContain('azure-compute-01');
    expect(text(container)).toContain('gcp-compute-01');
    expect(text(container)).toContain('Tag filtering is ready in the UI');

    unmount();
  });

  it('renders multi-category comparison rows in engineering mode', async () => {
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [
          ['compute', 'aws compute', 50],
          ['storage', 'aws storage', 10],
          ['database', 'aws database', 20],
          ['network', 'aws network', 5],
        ]),
        providerWithItems('azure', [
          ['compute', 'azure compute', 40],
          ['storage', 'azure storage', 8],
          ['database', 'azure database', 18],
          ['network', 'azure network', 4],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 60, true],
          ['storage', 'gcp storage', 12, true],
          ['database', 'gcp database', 30, true],
          ['network', 'gcp network', 6, true],
        ]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView comparison={richResult} interval="monthly" />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Potential savings');
    expect(text(container)).toContain('$456.00');

    expect(text(container)).toContain('EBS / S3');
    expect(text(container)).toContain('Disk / Blob');
    expect(text(container)).toContain('Azure SQL');
    expect(text(container)).toContain('Data transfer');
    expect(text(container)).toContain('Cloud SQL');
    expect(text(container)).toContain('Egress');
    expect(text(container)).toContain('aws compute');
    expect(text(container)).toContain('aws storage');
    expect(text(container)).toContain('aws database');
    expect(text(container)).toContain('aws network');
    expect(text(container)).toContain('azure compute');
    expect(text(container)).toContain('gcp compute');
    expect(text(container)).toContain('$60.00');
    expect(text(container)).toContain('$4.00');

    unmount();
  });

  it('surfaces compute specification matrix with architecture and tenancy economics', async () => {
    const computeResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'gcp',
      providers: [
        providerWithItems('aws', [['compute', 'aws memory compute', 200]]),
        providerWithItems('azure', [['compute', 'azure memory compute', 180]]),
        providerWithItems('gcp', [['compute', 'gcp memory compute', 160]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={computeResult}
        form={{
          ...defaultWorkloadForm,
          instanceTier: 'memory',
          processorArchitecture: 'arm64',
          computeTenancy: 'dedicated-host',
          vcpu: '4',
          memoryGb: '16',
          instanceCount: '3',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Compute specification matrix');
    expect(text(container)).toContain(
      'Family, capacity, network/disk baseline, and architecture economics',
    );
    expect(text(container)).toContain('R7g Graviton3');
    expect(text(container)).toContain('Epsv5 Ampere Altra');
    expect(text(container)).toContain('Tau T2A');
    expect(text(container)).toContain('3 nodes · 12 vCPU / 48GB');
    expect(text(container)).toContain('GB per $');
    expect(text(container)).toContain('Selected ARM vs x86');
    expect(text(container)).toContain('Dedicated host · 16 instance(s) per 64-vCPU reference host');
    expect(text(container)).toContain(
      'Validate host density and license/compliance placement before accepting the per-instance comparison.',
    );

    unmount();
  });

  it('surfaces Windows license optimization detail from licensing line items', async () => {
    const windowsResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [
          ['compute', 'aws compute', 80],
          ['licensing', 'aws Windows license', 24],
        ]),
        providerWithItems('azure', [
          ['compute', 'azure compute', 70],
          ['licensing', 'azure Windows license', 20],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 85],
          ['licensing', 'gcp Windows license', 22],
        ]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={windowsResult}
        form={{ ...defaultWorkloadForm, operatingSystem: 'windows' }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('License optimization detail');
    expect(text(container)).toContain(
      'Windows uplift, Linux-equivalent run-rate, and BYOL savings',
    );
    expect(text(container)).toContain('Hybrid Benefit / BYOL');
    expect(text(container)).toContain('$24.00/mo');
    expect(text(container)).toContain('$288.00/yr');
    expect(text(container)).toContain('Linux/BYOL equivalent');

    unmount();
  });

  it('surfaces storage optimization detail from modeled storage dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['storage', 'AWS snapshot retention estimate', 24],
      ['storage', 'AWS archive retrieval estimate', 12],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'storage',
      skuId: 'modeled-storage-snapshots',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'storage',
      skuId: 'modeled-storage-retrieval',
    };
    const storageResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={storageResult}
        form={{
          ...defaultWorkloadForm,
          storageEnabled: true,
          storageSizeGb: '1000',
          storageClass: 'archive',
          monthlyRetrievalGb: '250',
          snapshotSizeGb: '500',
          snapshotRetentionDays: '60',
          storageReplication: 'cross-region',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Storage optimization detail');
    expect(text(container)).toContain(
      'Storage class, retrieval, snapshots, replication, and performance tuning',
    );
    expect(text(container)).toContain('Snapshot retention');
    expect(text(container)).toContain('1,000GB archive · 250GB retrieval · cross region');
    expect(text(container)).toContain('$7.20/mo');
    expect(text(container)).toContain('$86.40/yr');
    expect(text(container)).toContain(
      'Reduce retention, deduplicate snapshots, or move older copies to colder tiers.',
    );
    expect(text(container)).toContain('500GB snapshots · 60 days');

    unmount();
  });

  it('surfaces database optimization detail from modeled database dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['database', 'AWS primary RU/s provisioned capacity estimate', 32],
      ['database', 'AWS primary NoSQL write unit estimate', 20],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'database',
      skuId: 'modeled-database-ru-capacity',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'database',
      skuId: 'modeled-database-nosql-write-units',
    };
    const databaseResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={databaseResult}
        form={{
          ...defaultWorkloadForm,
          databaseEnabled: true,
          databaseEngine: 'generic_nosql',
          databaseSizeGb: '250',
          databaseNosqlReadRequestUnitsMillion: '50',
          databaseNosqlWriteRequestUnitsMillion: '20',
          databaseRuPerSecond: '4000',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Database optimization detail');
    expect(text(container)).toContain(
      'NoSQL, RU/s, replicas, backups, cache, managed search, and query tuning',
    );
    expect(text(container)).toContain('RU/s provisioned capacity');
    expect(text(container)).toContain('generic nosql · 250GB data · 4,000 RU/s · 70M NoSQL units');
    expect(text(container)).toContain('$8.00/mo');
    expect(text(container)).toContain('$96.00/yr');
    expect(text(container)).toContain(
      'Validate RU/s utilization, autoscale limits, and serverless break-even.',
    );
    expect(text(container)).toContain('4,000 RU/s configured');

    unmount();
  });

  it('surfaces managed-search optimization detail from search database dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['database', 'Amazon OpenSearch Service capacity estimate', 120],
    ]);
    awsProvider.lineItems[0] = {
      ...awsProvider.lineItems[0],
      costComponent: 'database',
      skuId: 'modeled-database-search-capacity',
    };
    const searchResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 70]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 75]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={searchResult}
        form={{
          ...defaultWorkloadForm,
          databaseEnabled: true,
          databaseEngine: 'generic_nosql',
          databaseSizeGb: '500',
          databaseSearchNodeCount: '2',
          databaseSearchStorageGb: '500',
          databaseSearchQueriesMillion: '25',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Managed search capacity');
    expect(text(container)).toContain('2 search nodes · 500GB index');
    expect(text(container)).toContain('$26.40/mo');
    expect(text(container)).toContain('$316.80/yr');
    expect(text(container)).toContain(
      'Right-size search replicas, index lifecycle, and query capacity before scaling search clusters.',
    );

    unmount();
  });

  it('surfaces runtime optimization detail from serverless and container dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['compute', 'AWS serverless function GB-second estimate', 90],
      ['operations', 'AWS managed Kubernetes control plane estimate', 72],
      ['storage', 'AWS container registry storage estimate', 4],
      ['network', 'AWS container registry egress estimate', 9],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'compute',
      skuId: 'modeled-serverless-function-duration',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'operations',
      skuId: 'modeled-kubernetes-control-plane',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'storage',
      skuId: 'modeled-container-registry-storage',
    };
    awsProvider.lineItems[4] = {
      ...awsProvider.lineItems[4],
      costComponent: 'egress',
      skuId: 'modeled-container-registry-egress',
    };
    const runtimeResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 220]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 230]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={runtimeResult}
        form={{
          ...defaultWorkloadForm,
          functionInvocationsMillion: '5',
          functionDurationMs: '200',
          functionMemoryMb: '512',
          kubernetesClusterCount: '2',
          kubernetesWorkerNodeCount: '6',
          registryStorageGb: '40',
          registryEgressGb: '100',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Runtime optimization detail');
    expect(text(container)).toContain(
      'Functions, memory curve, Kubernetes overhead, registry, and platform fit',
    );
    expect(text(container)).toContain('Function duration / memory');
    expect(text(container)).toContain(
      '5M invocations · 200ms @ 512MB · 2 clusters / 6 nodes · 40GB registry · 100GB image egress',
    );
    expect(text(container)).toContain('$22.50/mo');
    expect(text(container)).toContain('$270.00/yr');
    expect(text(container)).toContain(
      'Tune the memory-duration knee and compare functions with always-on containers for steady traffic.',
    );
    expect(text(container)).toContain('5M invocations · 200ms @ 512MB');
    expect(text(container)).toContain('Serverless memory-duration curve');
    expect(text(container)).toContain('1,024MB @ 100ms');
    expect(text(container)).toContain('$9.33/mo');
    expect(text(container)).toContain(
      'Benchmark 1,024MB; keep duration at or below 100ms to improve latency without raising compute cost.',
    );

    unmount();
  });

  it('surfaces app platform request-based versus always-on model comparison', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 25],
      ['compute', 'AWS managed app platform request estimate', 0],
      ['compute', 'AWS managed app platform active vCPU estimate', 71.11],
      ['compute', 'AWS managed app platform active memory estimate', 3.89],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-requests',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-request-compute',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'compute',
      skuId: 'modeled-app-platform-request-memory',
    };
    const appPlatformResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 210]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 190]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={appPlatformResult}
        form={{
          ...defaultWorkloadForm,
          appPlatformRequestsMillion: '10',
          appPlatformRequestDurationMs: '400',
          appPlatformVcpu: '1',
          appPlatformMemoryGb: '0.5',
          appPlatformAlwaysOnHours: '730',
          appPlatformMinInstances: '1',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('App platform model comparison');
    expect(text(container)).toContain(
      'App Runner, App Service, and Cloud Run request-based vs always-on posture',
    );
    expect(text(container)).toContain('10M requests · 400ms · 1 vCPU / 0.5GB');
    expect(text(container)).toContain('$75.00/mo');
    expect(text(container)).toContain('$49.28/mo');
    expect(text(container)).toContain('Always-on');
    expect(text(container)).toContain('$25.72/mo · $308.64/yr spread');
    expect(text(container)).toContain(
      'Use always-on/provisioned app capacity for steady traffic; request-based metering is $25.72/mo higher at this shape.',
    );

    unmount();
  });

  it('surfaces operations optimization detail from observability and secrets dimensions', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      ['operations', 'AWS log ingestion estimate', 120],
      ['operations', 'AWS log retention storage estimate', 15],
      ['operations', 'AWS managed secrets estimate', 20],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'operations',
      skuId: 'modeled-operations-log-ingestion',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'operations',
      skuId: 'modeled-operations-log-retention',
    };
    awsProvider.lineItems[3] = {
      ...awsProvider.lineItems[3],
      costComponent: 'operations',
      skuId: 'modeled-security-secrets',
    };
    const operationsResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 230]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 240]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={operationsResult}
        form={{
          ...defaultWorkloadForm,
          observabilityLogsIngestGb: '240',
          observabilityLogRetentionGb: '500',
          observabilityMetricsMillion: '25',
          observabilityTracesMillion: '8',
          secretsCount: '50',
          secretApiCallsTenThousand: '300',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Operations optimization detail');
    expect(text(container)).toContain(
      'Observability, logging, tracing, secrets, WAF, and security posture controls',
    );
    expect(text(container)).toContain('Log ingestion volume');
    expect(text(container)).toContain(
      '25M metrics · 240GB logs · 500GB-mo retention · 8M traces · 50 secrets',
    );
    expect(text(container)).toContain('$36.00/mo');
    expect(text(container)).toContain('$432.00/yr');
    expect(text(container)).toContain(
      'Filter debug noise at source, sample high-volume streams, and route low-value logs to cheaper retention.',
    );
    expect(text(container)).toContain('240GB logs ingested/month');

    unmount();
  });

  it('surfaces private connectivity optimization from VPN and circuit network rows', async () => {
    const awsProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 40],
      [
        'network',
        'AWS VPN connectivity estimate (2 connection(s), 730 hrs, 1000 GB transfer)',
        163,
      ],
      [
        'network',
        'AWS private circuit estimate (1 circuit(s), 730 port hrs, 2000 GB transfer)',
        259,
      ],
    ]);
    awsProvider.lineItems[1] = {
      ...awsProvider.lineItems[1],
      costComponent: 'egress',
      skuId: 'modeled-vpn-connectivity',
    };
    awsProvider.lineItems[2] = {
      ...awsProvider.lineItems[2],
      costComponent: 'egress',
      skuId: 'modeled-private-circuit',
    };
    const networkResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'aws',
      providers: [
        awsProvider,
        providerWithItems('azure', [['compute', 'azure compute', 500]]),
        providerWithItems('gcp', [['compute', 'gcp compute', 520]]),
      ],
    };
    const { container, unmount } = render(
      <ComparisonView
        comparison={networkResult}
        form={{
          ...defaultWorkloadForm,
          vpnConnectionCount: '2',
          vpnConnectionHours: '730',
          vpnDataTransferGb: '1000',
          privateCircuitCount: '1',
          privateCircuitPortHours: '730',
          privateCircuitDataTransferGb: '2000',
        }}
        interval="monthly"
      />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Egress optimization detail');
    expect(text(container)).toContain('Private circuit');
    expect(text(container)).toContain('3,000GB private path');
    expect(text(container)).toContain('$64.75/mo');
    expect(text(container)).toContain(
      'Validate port speed, redundancy, metered-vs-unlimited transfer, and VPN-to-private-circuit break-even before final network design.',
    );
    expect(text(container)).toContain(
      'Connectivity architecture review models $64.75/mo opportunity at 25% of that private-connectivity baseline.',
    );

    unmount();
  });

  it('renders FinOps feature additions without fabricating unsupported backend data', async () => {
    const awsRichProvider = providerWithItems('aws', [
      ['compute', 'aws compute', 50],
      ['storage', 'aws storage', 10],
      ['database', 'aws database', 10],
      ['network', 'aws network egress', 30],
    ]);
    awsRichProvider.lineItems[0].pricingModels = [
      {
        model: 'spot',
        available: true,
        estimated: true,
        monthlyCostUsd: 24,
        caveat: 'Spot pricing is interruptible and volatile.',
      },
      {
        model: 'reserved-1yr',
        available: true,
        monthlyCostUsd: 42,
        upfrontOption: 'partial',
        upfrontCostUsd: 120,
      },
    ];
    awsRichProvider.lineItems[3] = {
      ...awsRichProvider.lineItems[3],
      costComponent: 'egress',
      region: 'us-east-1',
      unit: 'GB',
      unitPriceUsd: 0.1,
      pricingBasis: 'tiered',
      egressTiers: [
        {
          tierFromGb: 0,
          tierToGb: 300,
          pricePerGb: 0.1,
          billableGb: 300,
          monthlyCostUsd: 30,
        },
      ],
    };
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        {
          ...awsRichProvider,
          pricingModels: [
            {
              model: 'on-demand',
              available: true,
              monthlyCostUsd: 100,
              savingsPercentVsOnDemand: 0,
            },
            {
              model: 'spot',
              available: true,
              providerTerm: 'EC2 Spot Instances',
              estimated: true,
              volatility: 'volatile',
              monthlyCostUsd: 47.5,
              savingsPercentVsOnDemand: 52.5,
              caveat: 'Spot pricing is interruptible and volatile.',
            },
            {
              model: 'reserved-1yr',
              available: true,
              monthlyCostUsd: 42,
              hourlyCostUsd: 0.06,
              upfrontOption: 'partial',
              upfrontCostUsd: 120,
              commitmentTermMonths: 12,
              savingsPercentVsOnDemand: 58,
            },
          ],
        },
        providerWithItems('azure', [
          ['compute', 'azure compute', 40],
          ['storage', 'azure storage', 8],
          ['database', 'azure database', 17],
          ['network', 'azure network egress', 10],
        ]),
        providerWithItems('gcp', [
          ['compute', 'gcp compute', 60],
          ['storage', 'gcp storage', 12],
          ['database', 'gcp database', 23],
          ['network', 'gcp network egress', 15],
        ]),
      ],
    };
    const whatIfResult: ComparisonResult = {
      ...richResult,
      comparisonId: 'scenario-what-if-123',
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [['compute', 'aws what-if compute', 120]]),
        providerWithItems('azure', [['compute', 'azure what-if compute', 90]]),
        providerWithItems('gcp', [['compute', 'gcp what-if compute', 105]]),
      ],
    };
    const client = clientMock({
      createComparison: jest.fn(async () => whatIfResult),
    });
    const { container, unmount } = render(
      <ComparisonView client={client} comparison={richResult} interval="monthly" />,
    );
    await act(async () => undefined);

    expect(text(container)).toContain('Commitment scenario controls');
    expect(buttonByText(container, 'On-demand').disabled).toBe(false);
    expect(buttonByText(container, '1yr reserved').disabled).toBe(false);
    expect(buttonByText(container, '3yr reserved').disabled).toBe(false);
    expect(buttonByText(container, 'Spot').disabled).toBe(false);
    expect(buttonByText(container, 'Savings plan').disabled).toBe(false);
    expect(text(container)).toContain('Full cost matrix');
    expect(text(container)).toContain('AWS On-demand');
    expect(text(container)).toContain('Azure 1yr');
    expect(text(container)).toContain('$24.00 est.');
    expect(text(container)).toContain('$42.00');
    expect(text(container)).toContain('Production-depth analytics');
    expect(text(container)).toContain('AWS commitment ROI');
    expect(text(container)).toContain('Month 3');
    expect(text(container)).toContain('Break-even');
    expect(text(container)).toContain('Provider delta analysis');
    expect(text(container)).toContain('Why each service is cheaper');
    expect(text(container)).toContain('Azure is 33% lower than GCP for compute.');
    expect(text(container)).toContain('Region variance heat map');
    expect(text(container)).toContain('Modeled monthly sensitivity by compliant region');
    expect(text(container)).toContain('Europe West');
    expect(text(container)).toContain('Commitment coverage gap');
    expect(text(container)).toContain('0% on-demand vs target blend vs 100% committed');
    expect(text(container)).toContain('$20.30/mo');
    expect(text(container)).toContain('35% exposed');
    expect(text(container)).toContain('Cross-provider TCO signals');
    expect(text(container)).toContain('Egress exit proxy');
    expect(text(container)).toContain('Free-tier signal');
    expect(text(container)).toContain('Data-out proxy');
    expect(text(container)).toContain('Egress optimization detail');
    expect(text(container)).toContain(
      'Cache, NAT, private transfer, and high-volume data-out actions',
    );
    expect(text(container)).toContain('Internet egress');
    expect(text(container)).toContain(
      'Evaluate CDN offload, cache-control, and same-region data access.',
    );
    expect(text(container)).toContain('Spot blend optimizer');
    expect(text(container)).toContain('Mixed on-demand and interruptible-capacity estimate');
    expect(text(container)).toContain('80% on-demand / 20% spot');
    expect(text(container)).toContain('$89.50/mo est.');
    expect(text(container)).toContain('High interruption risk');
    expect(text(container)).toContain('Architecture risk flags');
    expect(text(container)).toContain('Cost behaviors to validate before commitment');
    expect(text(container)).toContain('Data-transfer concentration');
    expect(text(container)).toContain('Scenario sensitivity');
    expect(text(container)).toContain('Provider winner under operational shocks');
    expect(text(container)).toContain('Demand +25%');
    expect(text(container)).toContain('Best commitment path');
    expect(text(container)).toContain('Payment and TCO detail');
    expect(text(container)).toContain('Commitment scenario monthly, hourly, and term view');
    expect(text(container)).toContain('Upfront cash');
    expect(text(container)).toContain('$120.00');
    expect(text(container)).toContain('$624.00');
    expect(text(container)).toContain('upfront $120.00');
    expect(text(container)).toContain('Region and scale what-if');
    expect(text(container)).toContain('Cache-backed rerun without natural-language reparse');
    expect(text(container)).toContain('Egress tiered breakdown');
    expect(text(container)).toContain('0-300 GB');
    expect(text(container)).toContain('Best:');
    await click(buttonByText(container, 'Run what-if'));
    expect(client.parseWorkload).not.toHaveBeenCalled();
    expect(client.createComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          region: expect.objectContaining({
            preference: 'us-east',
          }),
        }),
        compute: [
          expect.objectContaining({
            instanceCount: 3,
          }),
        ],
      }),
    );
    expect(text(container)).toContain('Scenario comparison scenario-what-if-123');
    expect(text(container)).toContain('+$15.00');
    await click(buttonByText(container, 'Spot'));
    expect(text(container)).toContain('Est. $38.00-$57.00');
    expect(text(container)).toContain('estimated $38.00-$57.00/mo range');
    await click(buttonByText(container, '3yr reserved'));
    expect(text(container)).toContain('3yr reserved: Not available for this configuration.');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain('Egress/data transfer');
    expect(text(container)).toContain('Egress risk: $30.00 is 200% above the lowest provider.');
    expect(text(container)).toContain(
      'Create a real read-only report link scoped to this workload, pricing model, and time granularity.',
    );
    expect(client.getExchangeRates).toHaveBeenCalledWith('USD');
    expect(text(container)).toContain('Exchange rates');

    await changeInput(inputById(container, 'budget-threshold-usd'), '70');

    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    expect(text(container)).toContain('scheduled backend evaluator runs');
    await click(buttonByText(container, 'Save backend budget'));
    expect(client.createBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        thresholdUsd: 70,
        alertOnAnomalyPercent: 20,
      }),
    );
    expect(text(container)).toContain('Backend budget saved.');

    await click(buttonByText(container, 'Dismiss'));

    expect(text(container)).not.toContain('Estimated run-rate exceeds budget threshold.');

    unmount();
  });
});

function render(ui: React.ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;

  act(() => {
    root = createRoot(container);
    root.render(ui);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function changeFileInput(input: HTMLInputElement, file: File): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function inputById(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector(`#${id}`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${id}`);
  }

  return input;
}

function textareaById(container: HTMLElement, id: string): HTMLTextAreaElement {
  const textarea = container.querySelector(`#${id}`);

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Textarea not found: ${id}`);
  }

  return textarea;
}

function selectById(container: HTMLElement, id: string): HTMLSelectElement {
  const select = container.querySelector(`#${id}`);

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Select not found: ${id}`);
  }

  return select;
}

function checkboxByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const field = Array.from(container.querySelectorAll('.checkbox-field')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  const input = field?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Checkbox not found: ${label}`);
  }

  return input;
}

function serviceFamilyCheckboxByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const field = Array.from(container.querySelectorAll('.service-family-card')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  const input = field?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Service family not found: ${label}`);
  }

  return input;
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function templateButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.architecture-template-button'),
  ).find((candidate) => candidate.textContent?.includes(label));

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Template button not found: ${label}`);
  }

  return button;
}

function comparisonHistoryButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.comparison-history-row'),
  ).find((candidate) => candidate.textContent?.includes(label));

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Comparison history button not found: ${label}`);
  }

  return button;
}

function resultDisclosureByTitle(container: HTMLElement, title: string): HTMLElement {
  const disclosure = Array.from(container.querySelectorAll<HTMLElement>('.result-disclosure')).find(
    (details) => disclosureSummary(details).textContent?.includes(title),
  );

  if (!(disclosure instanceof HTMLElement)) {
    throw new Error(`Result disclosure not found: ${title}`);
  }

  return disclosure;
}

function disclosureSummary(details: HTMLElement): HTMLButtonElement {
  const summary = details.querySelector('.result-disclosure-heading');

  if (!(summary instanceof HTMLButtonElement)) {
    throw new Error('Result disclosure button not found');
  }

  return summary;
}

function mobileProviderLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.mobile-total-bar > span')).map((providerTotal) => {
    const value = providerTotal.textContent ?? '';
    const provider = ['AWS', 'Azure', 'GCP'].find((candidate) => value.startsWith(candidate));

    return provider ?? value;
  });
}

function clearClientCalls(client: PolyCostClient): void {
  [
    client.parseWorkload,
    client.validateWorkload,
    client.createComparison,
    client.refreshLiveComparison,
    client.createExportJob,
    client.getExportJob,
    client.downloadExportJob,
    client.exportComparison,
  ].forEach((method) => {
    if (jest.isMockFunction(method)) {
      method.mockClear();
    }
  });
}

function text(container: HTMLElement): string {
  return container.textContent ?? '';
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function clientMock(overrides: Partial<PolyCostClient> = {}): PolyCostClient {
  const parsed: ParsedNwsDraft = {
    draftNws: buildNwsFromForm(defaultWorkloadForm),
    parserConfidence: 'medium',
    fieldsRequiringReview: [],
  };
  const pricingStatus: PricingStatusResponse = {
    providers: [
      {
        providerId: 'aws',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
      {
        providerId: 'azure',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
      {
        providerId: 'gcp',
        status: 'success',
        recordsUpdated: 0,
        recordsRejected: 0,
        recordsSkipped: 0,
      },
    ],
  };
  const backendHealth: BackendHealthResponse = {
    status: 'ok',
    service: 'polycost-api',
  };
  const dataHealth: DataHealthResponse = {
    generatedAt: '2026-07-01T00:00:00.000Z',
    freshnessPolicyHours: 24,
    overallStatus: 'fresh',
    alertCount: 0,
    alerts: [],
    providers: [
      {
        providerId: 'aws',
        status: 'success',
        freshness: 'fresh',
        ageHours: 1,
        recordsUpdated: 12,
        recordsRejected: 0,
        recordsSkipped: 3,
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        message: 'Pricing cache refreshed 1h ago.',
      },
      {
        providerId: 'azure',
        status: 'success',
        freshness: 'fresh',
        ageHours: 1,
        recordsUpdated: 10,
        recordsRejected: 0,
        recordsSkipped: 2,
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        message: 'Pricing cache refreshed 1h ago.',
      },
      {
        providerId: 'gcp',
        status: 'success',
        freshness: 'fresh',
        ageHours: 1,
        recordsUpdated: 8,
        recordsRejected: 0,
        recordsSkipped: 1,
        lastSuccessfulRun: '2026-06-30T23:00:00.000Z',
        message: 'Pricing cache refreshed 1h ago.',
      },
    ],
  };
  const pendingRegionCatalog = new Promise<RegionCatalogResponse>(() => undefined);
  const reportExportJob: ReportExportJobResponse = {
    jobId: '66666666-6666-4666-8666-666666666666',
    comparisonId: comparisonResult.comparisonId,
    format: 'pdf',
    interval: 'monthly',
    pricingModel: 'on-demand',
    status: 'completed',
    fileName: 'polycost-comparison.pdf',
    contentType: 'application/pdf',
    createdAt: '2026-07-01T00:00:00.000Z',
    startedAt: '2026-07-01T00:00:01.000Z',
    completedAt: '2026-07-01T00:00:02.000Z',
    statusUrl: `/api/v1/comparisons/${comparisonResult.comparisonId}/export-jobs/66666666-6666-4666-8666-666666666666`,
    downloadUrl: `/api/v1/comparisons/${comparisonResult.comparisonId}/export-jobs/66666666-6666-4666-8666-666666666666/download`,
  };

  return {
    getHealth: jest.fn(async () => backendHealth),
    getDataHealth: jest.fn(async () => dataHealth),
    parseWorkload: jest.fn(async () => parsed),
    validateWorkload: jest.fn(async () => ({ valid: true as const })),
    createComparison: jest.fn(async () => comparisonResult),
    refreshLiveComparison: jest.fn(async () => comparisonResult),
    createExportJob: jest.fn(async () => reportExportJob),
    getExportJob: jest.fn(async () => reportExportJob),
    downloadExportJob: jest.fn(async () => new Blob(['report'])),
    exportComparison: jest.fn(async () => new Blob(['report'])),
    getPricingStatus: jest.fn(async () => pricingStatus),
    getPricingModels: jest.fn(async () => ({
      defaultModel: 'on-demand' as const,
      generatedAt: '2026-06-30T00:00:00.000Z',
      models: [],
    })),
    getPricingModelsForService: jest.fn(async () => ({
      schemaVersion: 2 as const,
      provider: 'aws' as const,
      service: 'compute',
      region: 'us-east-1',
      generatedAt: '2026-06-30T00:00:00.000Z',
      models: [
        {
          code: 'reserved_1yr' as const,
          label: 'Reserved (1-Year)',
          termMonths: 12,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
        {
          code: 'reserved_3yr' as const,
          label: 'Reserved (3-Year)',
          termMonths: 36,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
        {
          code: 'savings_plan_1yr' as const,
          label: 'Savings Plan / CUD (1-Year)',
          termMonths: 12,
          requiresPaymentOption: true,
          isEstimateOnly: false,
          paymentOptions: [
            { code: 'no_upfront' as const, label: 'No upfront' },
            { code: 'partial_upfront' as const, label: 'Partial upfront' },
            { code: 'all_upfront' as const, label: 'All upfront' },
          ],
          defaultPaymentOption: 'no_upfront' as const,
        },
      ],
    })),
    getRegionCatalog: jest.fn(() => pendingRegionCatalog),
    createWorkload: jest.fn(async (input) => ({
      ...input,
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    })),
    createShareLink: jest.fn(async () => ({
      token: 'public-token-123',
      url: '/api/v1/share/public-token-123',
    })),
    revokeShareLink: jest.fn(async () => ({
      token: 'public-token-123',
      url: '/api/v1/share/public-token-123',
    })),
    getShareLinkAnalytics: jest.fn(async () => ({
      token: 'public-token-123',
      totalViews: 0,
      countryViews: [],
      sectionViews: [],
    })),
    getSharedReport: jest.fn(async () => ({
      token: 'public-token-123',
      watermark: true,
      expiresAt: '2026-07-29T00:00:00.000Z',
      pricingModel: 'on-demand' as const,
      granularity: 'monthly' as const,
      passwordProtected: false,
      workload: {
        id: '22222222-2222-4222-8222-222222222222',
        instanceFamily: 'general-purpose' as const,
        vcpu: 2,
        memoryGb: 4,
        region: 'us-east',
        instanceCount: 2,
        hoursPerMonth: 730,
        storageGb: 250,
        storageTier: 'standard' as const,
        egressGbPerMonth: 750,
        createdAt: '2026-06-29T00:00:00.000Z',
        updatedAt: '2026-06-29T00:00:00.000Z',
      },
      breakdown: {
        workloadId: '22222222-2222-4222-8222-222222222222',
        term: 'on_demand' as const,
        providers: [
          {
            provider: 'aws' as const,
            region: 'us-east-1',
            compute: 20,
            storage: 10,
            egress: 5,
            total: 35,
            currency: 'USD' as const,
          },
        ],
      },
    })),
    createBudget: jest.fn(async (input) => ({
      ...input,
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    })),
    listAlerts: jest.fn(async (workloadId = '22222222-2222-4222-8222-222222222222') => [
      {
        id: '44444444-4444-4444-8444-444444444444',
        workloadId,
        budgetId: '33333333-3333-4333-8333-333333333333',
        alertType: 'budget_threshold' as const,
        message: 'Modeled monthly cost exceeds budget threshold.',
        thresholdUsd: 70,
        observedUsd: 75,
        dismissed: false,
        triggeredAt: '2026-06-29T00:00:00.000Z',
      },
    ]),
    updateAlertDismissed: jest.fn(async (alertId) => ({
      id: alertId,
      workloadId: '22222222-2222-4222-8222-222222222222',
      budgetId: '33333333-3333-4333-8333-333333333333',
      alertType: 'budget_threshold' as const,
      message: 'Modeled monthly cost exceeds budget threshold.',
      thresholdUsd: 70,
      observedUsd: 75,
      dismissed: true,
      dismissedAt: '2026-06-29T00:00:00.000Z',
      triggeredAt: '2026-06-29T00:00:00.000Z',
    })),
    getExchangeRates: jest.fn(async () => ({
      base: 'USD',
      lastUpdated: '2026-06-29T00:00:00.000Z',
      rates: {
        PKR: 278,
        EUR: 0.93,
        GBP: 0.79,
      },
    })),
    ...overrides,
  };
}

function provider(
  providerId: ComparisonResult['providers'][number]['providerId'],
  monthly: number,
  approximate = false,
): ComparisonResult['providers'][number] {
  return {
    providerId,
    lineItems: [
      {
        category: 'compute',
        description: `${providerId} compute`,
        isApproximate: approximate,
        baseMonthlyCostUsd: monthly,
      },
    ],
    totals: {
      hourly: monthly * intervalMultiplierFromMonthly('hourly'),
      daily: monthly * intervalMultiplierFromMonthly('daily'),
      weekly: monthly * intervalMultiplierFromMonthly('weekly'),
      monthly,
      quarterly: monthly * intervalMultiplierFromMonthly('quarterly'),
      yearly: monthly * intervalMultiplierFromMonthly('yearly'),
    },
  };
}

function providerWithItems(
  providerId: ComparisonResult['providers'][number]['providerId'],
  lineItems: Array<
    [
      ComparisonResult['providers'][number]['lineItems'][number]['category'],
      string,
      number,
      boolean?,
    ]
  >,
): ComparisonResult['providers'][number] {
  const monthly = lineItems.reduce((sum, [, , cost]) => sum + cost, 0);

  return {
    providerId,
    lineItems: lineItems.map(([category, description, baseMonthlyCostUsd, isApproximate]) => ({
      category,
      description,
      isApproximate: Boolean(isApproximate),
      baseMonthlyCostUsd,
    })),
    totals: {
      hourly: monthly * intervalMultiplierFromMonthly('hourly'),
      daily: monthly * intervalMultiplierFromMonthly('daily'),
      weekly: monthly * intervalMultiplierFromMonthly('weekly'),
      monthly,
      quarterly: monthly * intervalMultiplierFromMonthly('quarterly'),
      yearly: monthly * intervalMultiplierFromMonthly('yearly'),
    },
  };
}
