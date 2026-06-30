import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App, ComparisonView } from './App';
import { PolyCostClient, PolyCostApiError } from './api-client';
import {
  BackendHealthResponse,
  ComparisonResult,
  ParsedNwsDraft,
  PricingStatusResponse,
  RegionCatalogResponse,
} from './types';
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
  });

  it('runs the structured-form comparison flow', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    expect(text(container)).toContain('Multi-cloud cost clarity, in one place.');
    expect(buttonByText(container, 'Compare costs')).toBeInstanceOf(HTMLButtonElement);
    expect(container.querySelector('.landing-comparison')).toBeNull();
    expect(container.querySelector('.comparison-toolbar')).toBeNull();
    expect(container.querySelector('.workbench-results')).toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('.initial-optional-estimate')?.open).toBe(
      false,
    );

    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('Requirements');
    expect(text(container)).toContain('Web app · 2 vCPU · 4GB · US East (N. Virginia)');
    expect(text(container)).toContain('Best value');
    expect(text(container)).toContain('Monthly estimate');
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
    expect(Array.from(container.querySelectorAll<HTMLDetailsElement>('.result-disclosure'))).toHaveLength(
      5,
    );
    expect(
      Array.from(container.querySelectorAll<HTMLDetailsElement>('.result-disclosure')).every(
        (details) => !details.open,
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
    expect(text(container)).toContain('Cost periods & executive analytics');
    expect(text(container)).toContain('Pricing models, breakdown, budget & share');
    expect(text(container)).toContain('Architecture & engineering evidence');
    expect(text(container)).toContain('Official calculators & regions');
    expect(text(container)).toContain('Export report');
    expect(text(container)).toContain('GCP is the current executive cost baseline');
    expect(text(container)).toContain('Decision Brief');
    expect(text(container)).toContain('Save vs next');
    expect(text(container)).toContain('$8.00');
    expect(text(container)).toContain('Official calculators');
    expect(text(container)).toContain('Official region and zone maps');
    expect(text(container)).toContain('AWS Regions & AZs');
    expect(text(container)).toContain('Azure Regions & AZs');
    expect(text(container)).toContain('GCP Regions & Zones');
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]'),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://aws.amazon.com/about-aws/global-infrastructure/regions_az/"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://learn.microsoft.com/en-us/azure/reliability/availability-zones-region-support"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://cloud.google.com/compute/docs/regions-zones"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);

    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('Spec / SKU');
    expect(text(container)).toContain('Export CSV');
    expect(text(container)).toContain('API JSON');
    expect(text(container)).toContain('SKU/spec pending API field');

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

  it('keeps relocated features functional inside accessible accordions', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Compare costs'));

    const disclosures = Array.from(
      container.querySelectorAll<HTMLDetailsElement>('.result-disclosure'),
    );
    expect(disclosures).toHaveLength(5);
    expect(disclosures.every((details) => !details.open)).toBe(true);
    expect(
      disclosures.every(
        (details) =>
          disclosureSummary(details).getAttribute('aria-expanded') === 'false' &&
          Boolean(document.getElementById(disclosureSummary(details).getAttribute('aria-controls') ?? '')),
      ),
    ).toBe(true);

    const costPeriods = resultDisclosureByTitle(container, 'Cost periods & executive analytics');
    await keyDown(disclosureSummary(costPeriods), 'Enter');
    expect(costPeriods.open).toBe(true);
    expect(disclosureSummary(costPeriods).getAttribute('aria-expanded')).toBe('true');

    await click(buttonByText(container, 'Yearly'));
    expect(text(container)).toContain('Yearly estimate');

    const finOps = resultDisclosureByTitle(container, 'Pricing models, breakdown, budget & share');
    await keyDown(disclosureSummary(finOps), ' ');
    expect(finOps.open).toBe(true);
    expect(disclosureSummary(finOps).getAttribute('aria-expanded')).toBe('true');

    await click(buttonByText(container, '1yr reserved'));
    expect(buttonByText(container, '1yr reserved').getAttribute('aria-pressed')).toBe('true');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain('No fake public link has been generated.');

    await changeInput(inputById(container, 'budget-threshold-usd'), '10');
    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    await click(buttonByText(container, 'Dismiss'));
    expect(text(container)).not.toContain('Estimated run-rate exceeds budget threshold.');

    const architecture = resultDisclosureByTitle(container, 'Architecture & engineering evidence');
    await keyDown(disclosureSummary(architecture), 'Enter');
    expect(architecture.open).toBe(true);
    expect(text(container)).toContain('Resource name');
    expect(text(container)).toContain('API JSON');

    const officialLinks = resultDisclosureByTitle(container, 'Official calculators & regions');
    await keyDown(disclosureSummary(officialLinks), 'Enter');
    expect(officialLinks.open).toBe(true);
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]'),
    ).toBeInstanceOf(HTMLAnchorElement);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://cloud.google.com/compute/docs/regions-zones"]',
      ),
    ).toBeInstanceOf(HTMLAnchorElement);

    const exportReport = resultDisclosureByTitle(container, 'Export report');
    await keyDown(disclosureSummary(exportReport), 'Enter');
    expect(exportReport.open).toBe(true);
    await click(buttonByText(container, 'PDF'));
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf');

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
        buttonByText(container, 'Exporting PDF...').querySelector('.animate-spin'),
      ).toBeInstanceOf(SVGElement);

      exportDeferred.resolve(new Blob(['report']));
      await act(async () => {
        await exportDeferred.promise;
      });
    } finally {
      unmount();
    }
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
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
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
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf');

    unmount();
  });

  it('keeps submitted results stable while editing draft requirements', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await changeSelect(selectById(container, 'workload-type'), 'api_backend');
    await changeInput(inputById(container, 'vcpu'), '4');
    await changeInput(inputById(container, 'memory-gb'), '8');
    await click(buttonByText(container, 'Compare costs'));

    expect(text(container)).toContain('API backend · 4 vCPU · 8GB');

    await click(buttonByText(container, 'Edit'));
    await changeInput(inputById(container, 'vcpu'), '16');
    await changeInput(inputById(container, 'memory-gb'), '64');

    expect(container.querySelector('.requirements-edit-panel')).toBeInstanceOf(HTMLElement);
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(3);
    expect(text(container)).toContain('$42.00');

    await click(buttonByText(container, 'Done'));

    expect(container.querySelector('.requirements-edit-panel')).toBeNull();
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('API backend · 4 vCPU · 8GB');
    expect(text(container)).not.toContain('16 vCPU');
    expect(text(container)).not.toContain('64GB');

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

    await click(buttonByText(container, 'Compare costs'));
    clearClientCalls(client);
    await click(buttonByText(container, 'Edit'));
    await click(buttonByText(container, 'Describe'));
    await click(buttonByText(container, 'Parse & compare'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('web app'));
    expect(client.validateWorkload).toHaveBeenCalledWith(parsedNws);
    expect(client.createComparison).toHaveBeenCalledWith(parsedNws);
    await click(buttonByText(container, 'Edit'));
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).toContain('Parsed with medium confidence. Review 1 field.');
    expect(text(container)).not.toContain('Comparison ready.');

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
    await click(buttonByText(container, 'Describe'));
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

    await click(buttonByText(container, 'Compare costs'));
    await click(buttonByText(container, 'Edit'));
    await click(buttonByText(container, 'Describe'));
    await click(buttonByText(container, 'Parse'));

    expect(text(container)).toContain('Input was not understood');
    expect(text(container)).toContain('Monthly estimate');
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
    expect(text(container)).toContain('Run comparison to populate data');
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
    expect(text(container)).toContain('Azure is the current executive cost baseline');

    unmount();
  });

  it('renders executive persona metrics and engineering resource rows from shared costs', async () => {
    const { container, unmount } = render(
      <ComparisonView comparison={comparisonResult} interval="monthly" />,
    );

    expect(text(container)).toContain('$30.00');
    expect(text(container)).toContain('GCP is the current executive cost baseline');
    expect(text(container)).toContain('Decision Brief');
    expect(text(container)).toContain('$360.00');
    expect(text(container)).toContain('Save vs next');
    expect(text(container)).toContain('$8.00');
    expect(text(container)).toContain('Financial Analytics');
    expect(text(container)).toContain('Run-rate Ladder');
    expect(text(container)).toContain('Provider Variance');
    expect(text(container)).toContain('Cost Mix Stack');
    expect(text(container)).toContain('Unit Economics');
    expect(text(container)).toContain('$1,080.00');

    await click(resultTabByText(container, 'Engineering View'));

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

    expect(text(container)).toContain('Save vs next');
    expect(text(container)).toContain('$15.00');

    await click(resultTabByText(container, 'Engineering View'));

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

  it('renders FinOps feature additions without fabricating unsupported backend data', async () => {
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        providerWithItems('aws', [
          ['compute', 'aws compute', 50],
          ['storage', 'aws storage', 10],
          ['database', 'aws database', 10],
          ['network', 'aws network egress', 30],
        ]),
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
    const { container, unmount } = render(
      <ComparisonView comparison={richResult} interval="monthly" />,
    );

    await click(resultTabByText(container, 'Engineering View'));

    expect(text(container)).toContain('Commitment scenario controls');
    expect(buttonByText(container, 'On-demand').disabled).toBe(false);
    expect(buttonByText(container, '1yr reserved').disabled).toBe(false);
    expect(buttonByText(container, '3yr reserved').disabled).toBe(false);
    expect(text(container)).not.toContain('Spot');
    expect(text(container)).toContain('3yr reserved: Not available for this configuration.');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain('Egress/data transfer');
    expect(text(container)).toContain('Egress risk: $30.00 is 200% above the lowest provider.');
    expect(text(container)).toContain('No fake public link has been generated.');
    expect(text(container)).toContain('PKR - exchange backend pending');

    await changeInput(inputById(container, 'budget-threshold-usd'), '70');

    expect(text(container)).toContain('Estimated run-rate exceeds budget threshold.');
    expect(text(container)).toContain(
      'live anomaly monitoring still needs backend alert infrastructure',
    );

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

async function keyDown(element: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
  });
}

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function inputById(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector(`#${id}`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${id}`);
  }

  return input;
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

function resultTabByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('.result-tabs button')).find((candidate) =>
    Array.from(candidate.querySelectorAll('span')).some(
      (span) => span.textContent?.trim() === label,
    ),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Result tab not found: ${label}`);
  }

  return button;
}

function resultDisclosureByTitle(container: HTMLElement, title: string): HTMLDetailsElement {
  const disclosure = Array.from(container.querySelectorAll<HTMLDetailsElement>('.result-disclosure')).find(
    (details) => disclosureSummary(details).textContent?.includes(title),
  );

  if (!(disclosure instanceof HTMLDetailsElement)) {
    throw new Error(`Result disclosure not found: ${title}`);
  }

  return disclosure;
}

function disclosureSummary(details: HTMLDetailsElement): HTMLElement {
  const summary = details.querySelector('summary');

  if (!(summary instanceof HTMLElement)) {
    throw new Error('Result disclosure summary not found');
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
  const pendingRegionCatalog = new Promise<RegionCatalogResponse>(() => undefined);

  return {
    getHealth: jest.fn(async () => backendHealth),
    parseWorkload: jest.fn(async () => parsed),
    validateWorkload: jest.fn(async () => ({ valid: true as const })),
    createComparison: jest.fn(async () => comparisonResult),
    refreshLiveComparison: jest.fn(async () => comparisonResult),
    exportComparison: jest.fn(async () => new Blob(['report'])),
    getPricingStatus: jest.fn(async () => pricingStatus),
    getRegionCatalog: jest.fn(() => pendingRegionCatalog),
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
      daily: monthly / 30,
      weekly: (monthly / 30) * 7,
      monthly,
      quarterly: monthly * 3,
      yearly: monthly * 12,
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
      daily: monthly / 30,
      weekly: (monthly / 30) * 7,
      monthly,
      quarterly: monthly * 3,
      yearly: monthly * 12,
    },
  };
}
