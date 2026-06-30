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
      'Web app · 2 vCPU · 4GB · US East (AWS us-east-1 · Azure eastus · GCP us-east1)',
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
    expect(text(container)).toContain('Executive monthly baseline');
    expect(text(container)).toContain('Provider mix');
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
    expect(container.querySelector<HTMLAnchorElement>('a[href="https://calculator.aws/#/"]')).toBeNull();
    expect(text(container)).not.toContain('Resource name');
    expect(text(container)).not.toContain('Spec / SKU');
    expect(text(container)).not.toContain('Export CSV');
    expect(text(container)).not.toContain('API JSON');
    expect(text(container)).not.toContain('SKU/spec pending API field');

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

    const disclosures = Array.from(
      container.querySelectorAll<HTMLElement>('.result-disclosure'),
    );
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
          Boolean(document.getElementById(disclosureSummary(details).getAttribute('aria-controls') ?? '')),
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
      'Create a real read-only report link scoped to this workload.',
    );
    await click(buttonByText(detailGate, 'Create & copy link'));
    expect(client.createWorkload).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-east' }),
    );
    expect(client.createShareLink).toHaveBeenCalledWith({
      workloadId: '22222222-2222-4222-8222-222222222222',
      watermark: true,
      expiresInDays: 30,
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
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf');

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
          resultDisclosureByTitle(container, 'Show full breakdown, pricing models & export options'),
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
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf');

    unmount();
  });

  it('hides submitted results while editing draft requirements', async () => {
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
    expect(container.querySelectorAll('.provider-summary-card')).toHaveLength(0);
    expect(container.querySelector('.result-disclosure')).toBeNull();
    expect(text(container)).not.toContain('$42.00');

    await click(buttonByText(container, 'Compare'));

    expect(container.querySelector('.requirements-edit-panel')).toBeNull();
    expect(container.querySelector('.requirement-summary-strip')).toBeInstanceOf(HTMLElement);
    expect(text(container)).toContain('API backend · 16 vCPU · 64GB');
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
    await click(buttonByText(container, 'Parse & compare'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('web app'));
    expect(client.validateWorkload).toHaveBeenCalledWith(parsedNws);
    expect(client.createComparison).toHaveBeenCalledWith(parsedNws);
    expect(text(container)).toContain('Parsed from text');
    expect(text(container)).toContain('Parsed with medium confidence. Review 1 field.');

    await click(buttonByText(container, 'Edit'));
    expect(buttonByText(container, 'Paste / parse').getAttribute('aria-selected')).toBe('true');
    expect(textareaById(container, 'natural-language-input').value).toContain('web app');

    await click(buttonByText(container, 'Guided form'));
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
    await click(buttonByText(container, 'Parse & compare'));

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
    expect(container.querySelectorAll('.engineering-bar-chart-shell .recharts-wrapper').length).toBeGreaterThanOrEqual(3);
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
    const client = clientMock();
    const { container, unmount } = render(
      <ComparisonView client={client} comparison={richResult} interval="monthly" />,
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

  it('renders FinOps feature additions without fabricating unsupported backend data', async () => {
    const richResult: ComparisonResult = {
      ...comparisonResult,
      cheapestProviderId: 'azure',
      providers: [
        {
          ...providerWithItems('aws', [
            ['compute', 'aws compute', 50],
            ['storage', 'aws storage', 10],
            ['database', 'aws database', 10],
            ['network', 'aws network egress', 30],
          ]),
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
    const client = clientMock();
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
    expect(text(container)).toContain('Best:');
    await click(buttonByText(container, '3yr reserved'));
    expect(text(container)).toContain('3yr reserved: Not available for this configuration.');
    expect(text(container)).toContain('Compute, storage, and data-transfer mix');
    expect(text(container)).toContain('Egress/data transfer');
    expect(text(container)).toContain('Egress risk: $30.00 is 200% above the lowest provider.');
    expect(text(container)).toContain(
      'Create a real read-only report link scoped to this workload.',
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
    getPricingModels: jest.fn(async () => ({
      defaultModel: 'on-demand' as const,
      generatedAt: '2026-06-30T00:00:00.000Z',
      models: [],
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
    getSharedReport: jest.fn(async () => ({
      token: 'public-token-123',
      watermark: true,
      expiresAt: '2026-07-29T00:00:00.000Z',
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
      hourly: monthly / 730,
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
      hourly: monthly / 730,
      daily: monthly / 30,
      weekly: (monthly / 30) * 7,
      monthly,
      quarterly: monthly * 3,
      yearly: monthly * 12,
    },
  };
}
