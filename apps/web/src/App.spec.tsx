import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App, ComparisonView } from './App';
import { PolyCostClient, PolyCostApiError } from './api-client';
import { ComparisonResult, ParsedNwsDraft, PricingStatusResponse } from './types';
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
    window.URL.createObjectURL = jest.fn(() => 'blob:polycost-report');
    window.URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectUrl;
    window.URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themeChoice = 'system';
  });

  it('runs the structured-form comparison flow', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Form'));
    await click(buttonByText(container, 'Compare'));

    expect(text(container)).toContain('Traffic');
    expect(text(container)).toContain('Services');
    expect(text(container)).toContain('Cloud services');
    expect(text(container)).toContain('Virtual machines');
    expect(text(container)).toContain('Generative AI');
    expect(text(container)).toContain('Mapped / roadmap');
    expect(text(container)).toContain('Network');
    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: '1.0',
        sourceTraceability: expect.arrayContaining([
          {
            nwsPath: 'metadata.serviceCatalog',
            sourceRef: 'serviceCatalog:vm-compute',
          },
        ]),
      }),
    );
    expect(client.createComparison).toHaveBeenCalled();
    expect(text(container)).toContain('Comparison ready.');
    expect(providerHeadings(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(providerLogoProviders(container)).toEqual(['aws', 'azure', 'gcp']);
    expect(text(container)).toContain('Amazon Web Services');
    expect(text(container)).toContain('Microsoft Azure');
    expect(text(container)).toContain('Google Cloud Platform');
    expect(text(container)).toContain('Lowest cost');

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

  it('shows loading spinners while parse, compare, refresh, and export actions are pending', async () => {
    const parsed: ParsedNwsDraft = {
      draftNws: buildNwsFromForm(defaultWorkloadForm),
      parserConfidence: 'medium',
      fieldsRequiringReview: [],
    };
    const parseDeferred = deferred<ParsedNwsDraft>();
    const validateDeferred = deferred<{ valid: true }>();
    const refreshDeferred = deferred<ComparisonResult>();
    const exportDeferred = deferred<Blob>();
    const client = clientMock({
      parseWorkload: jest.fn(() => parseDeferred.promise),
      validateWorkload: jest.fn(() => validateDeferred.promise),
      refreshLiveComparison: jest.fn(() => refreshDeferred.promise),
      exportComparison: jest.fn(() => exportDeferred.promise),
    });
    const { container, unmount } = render(<App client={client} />);

    try {
      await click(buttonByText(container, 'Parse'));

      expect(buttonByText(container, 'Parsing').querySelector('.animate-spin')).toBeInstanceOf(
        SVGElement,
      );

      parseDeferred.resolve(parsed);
      await act(async () => {
        await parseDeferred.promise;
      });

      await click(buttonByText(container, 'Compare'));

      expect(buttonByText(container, 'Comparing').querySelector('.animate-spin')).toBeInstanceOf(
        SVGElement,
      );

      validateDeferred.resolve({ valid: true });
      await act(async () => {
        await validateDeferred.promise;
      });

      await click(buttonByText(container, 'Refresh live'));

      expect(buttonByText(container, 'Refresh live').querySelector('.animate-spin')).toBeInstanceOf(
        SVGElement,
      );

      refreshDeferred.resolve(comparisonResult);
      await act(async () => {
        await refreshDeferred.promise;
      });

      await click(buttonByText(container, 'PDF'));

      expect(buttonByText(container, 'PDF').querySelector('.animate-spin')).toBeInstanceOf(
        SVGElement,
      );

      exportDeferred.resolve(new Blob(['report']));
      await act(async () => {
        await exportDeferred.promise;
      });
    } finally {
      unmount();
    }
  });

  it('clears requirements input and rendered cost breakdowns', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Clear'));

    expect((container.querySelector('#natural-language-input') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(buttonByText(container, 'Clear').disabled).toBe(true);

    await click(buttonByText(container, 'Sample'));

    expect(
      (container.querySelector('#natural-language-input') as HTMLTextAreaElement).value.length,
    ).toBeGreaterThan(0);

    await click(buttonByText(container, 'Form'));
    await click(buttonByText(container, 'Compare'));

    expect(text(container)).toContain('Comparison ready.');
    expect(buttonByText(container, 'Refresh live').disabled).toBe(false);
    expect(buttonByText(container, 'PDF').disabled).toBe(false);

    await click(buttonByText(container, 'Clear costs'));

    expect(text(container)).toContain('Ready to compare');
    expect(buttonByText(container, 'Refresh live').disabled).toBe(true);
    expect(buttonByText(container, 'PDF').disabled).toBe(true);

    unmount();
  });

  it('supports form edits, theme changes, interval changes, refresh, and export', async () => {
    const client = clientMock();
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Dark'));
    await click(buttonByText(container, 'System'));
    await click(buttonByText(container, 'Form'));

    await changeInput(inputById(container, 'name'), 'Edited portal');
    await changeSelect(selectById(container, 'type'), 'api_backend');
    await changeInput(inputById(container, 'region'), 'us-west-2');
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
    expect(document.documentElement.dataset.themeChoice).toBe('system');

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

    await click(buttonByText(container, 'Parse & compare'));

    expect(client.parseWorkload).toHaveBeenCalledWith(expect.stringContaining('web app'));
    expect(client.validateWorkload).toHaveBeenCalledWith(parsedNws);
    expect(client.createComparison).toHaveBeenCalledWith(parsedNws);
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe(
      'Parsed and compared portal',
    );
    expect(text(container)).toContain('Parsed with medium confidence. Review 1 field.');
    expect(text(container)).toContain('Comparison ready.');

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

    await click(buttonByText(container, 'Form'));
    await click(buttonByText(container, 'Compare'));

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

    await click(buttonByText(container, 'Sample'));
    await click(buttonByText(container, 'Parse'));

    expect(text(container)).toContain('Input was not understood');
    expect(text(container)).toContain('Using cached pricing catalog');
    expect(text(container)).not.toContain('Pricing status restricted');

    unmount();
  });
});

describe('ComparisonView', () => {
  it('renders an empty pre-comparison state without pricing failure language', () => {
    const { container, unmount } = render(<ComparisonView comparison={null} interval="monthly" />);

    expect(providerHeadings(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Pending');
    expect(text(container)).toContain('Ready to compare');
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

    expect(providerHeadings(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Unavailable');
    expect(text(container)).toContain('Lowest cost');

    unmount();
  });

  it('renders dashboard metrics and dynamic provider charts', () => {
    const { container, unmount } = render(
      <ComparisonView comparison={comparisonResult} interval="monthly" />,
    );

    expect(text(container)).toContain('Decision Brief');
    expect(text(container)).toContain('Executive Memo');
    expect(text(container)).toContain('GCP is the current executive cost baseline');
    expect(text(container)).toContain('CEO');
    expect(text(container)).toContain('CTO');
    expect(text(container)).toContain('Provider Spend');
    expect(text(container)).toContain('Category Mix');
    expect(text(container)).toContain('FinOps Decision Signals');
    expect(text(container)).toContain('Monthly run-rate');
    expect(text(container)).toContain('Provider Fit');
    expect(text(container)).toContain('Recommended Next Checks');
    expect(text(container)).toContain('Provider Ranking');
    expect(text(container)).toContain('Interval Outlook');
    expect(text(container)).toContain('Category Heatmap');
    expect(text(container)).toContain('Lowest');
    expect(text(container)).toContain('Average');
    expect(text(container)).toContain('$36.67');
    expect(text(container)).toContain('3/3');
    expect(text(container)).toContain('GCP leads Monthly');
    expect(text(container)).toContain('Save vs next');
    expect(text(container)).toContain('Approximate lines');
    expect(providerChartLabels(container)).toEqual(['GCP', 'Azure', 'AWS']);
    expect(rankingProviderLabels(container)).toEqual(['GCP', 'Azure', 'AWS']);
    expect(intervalLabels(container)).toEqual([
      'Daily',
      'Weekly',
      'Monthly',
      'Quarterly',
      'Yearly',
    ]);

    const gcpBar = container.querySelector('.provider-fill-gcp');
    const awsBar = container.querySelector('.provider-fill-aws');

    expect(gcpBar).toBeInstanceOf(HTMLElement);
    expect(awsBar).toBeInstanceOf(HTMLElement);
    expect((gcpBar as HTMLElement).style.width).toBe('71.42857142857143%');
    expect((awsBar as HTMLElement).style.width).toBe('100%');

    unmount();
  });

  it('renders cross-provider ranking and category heatmap from multi-category costs', () => {
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

    expect(text(container)).toContain('Azure leads Monthly');
    expect(text(container)).toContain('$15.00');
    expect(text(container)).toContain('$38.00');
    expect(text(container)).toContain('4');
    expect(rankingProviderLabels(container)).toEqual(['Azure', 'AWS', 'GCP']);
    expect(heatmapRows(container)).toEqual([
      'Compute$50.00$40.00$60.00',
      'Storage$10.00$8.00$12.00',
      'Database$20.00$18.00$30.00',
      'Network$5.00$4.00$6.00',
    ]);

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

function providerHeadings(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.provider-card h2')).map(
    (heading) => heading.textContent ?? '',
  );
}

function providerLogoProviders(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-provider-logo]')).map(
    (logo) => logo.getAttribute('data-provider-logo') ?? '',
  );
}

function providerChartLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.provider-bars .bar-provider strong')).map(
    (label) => label.textContent ?? '',
  );
}

function rankingProviderLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ranking-table .rank-provider')).map(
    (label) => label.textContent ?? '',
  );
}

function intervalLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.interval-row > strong')).map(
    (label) => label.textContent ?? '',
  );
}

function heatmapRows(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.heatmap-row:not(.heatmap-head)')).map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ''),
  );
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
      { providerId: 'aws', status: 'success' },
      { providerId: 'azure', status: 'success' },
      { providerId: 'gcp', status: 'success' },
    ],
  };

  return {
    parseWorkload: jest.fn(async () => parsed),
    validateWorkload: jest.fn(async () => ({ valid: true as const })),
    createComparison: jest.fn(async () => comparisonResult),
    refreshLiveComparison: jest.fn(async () => comparisonResult),
    exportComparison: jest.fn(async () => new Blob(['report'])),
    getPricingStatus: jest.fn(async () => pricingStatus),
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
