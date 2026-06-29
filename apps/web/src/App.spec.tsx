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

    expect(client.validateWorkload).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: '1.0' }),
    );
    expect(client.createComparison).toHaveBeenCalled();
    expect(text(container)).toContain('Comparison ready.');
    expect(providerHeadings(container)).toEqual(['AWS', 'Azure', 'GCP']);
    expect(text(container)).toContain('Lowest cost');

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
    await click(checkboxByLabel(container, 'CDN'));
    await click(checkboxByLabel(container, 'Load balancer'));
    await click(checkboxByLabel(container, 'Multi-region'));
    await changeInput(inputById(container, 'storage-gb'), '512');
    await changeSelect(selectById(container, 'storage-type'), 'file');
    await changeSelect(selectById(container, 'database'), 'mysql');
    await changeInput(inputById(container, 'database-gb'), '200');
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
      }),
    );
    expect(client.refreshLiveComparison).toHaveBeenCalledWith(comparisonResult.comparisonId);
    expect(client.exportComparison).toHaveBeenCalledWith(comparisonResult.comparisonId, 'pdf');
    expect(document.documentElement.dataset.themeChoice).toBe('system');

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

  it('renders parse errors and pricing-status restrictions', async () => {
    const client = clientMock({
      parseWorkload: jest.fn(async () => {
        throw new PolyCostApiError(422, 'WORKLOAD_PARSE_ERROR', 'Input was not understood');
      }),
      getPricingStatus: jest.fn(async () => {
        throw new PolyCostApiError(401, 'UNAUTHORIZED', 'Admin API key is required');
      }),
    });
    const { container, unmount } = render(<App client={client} />);

    await click(buttonByText(container, 'Sample'));
    await click(buttonByText(container, 'Parse'));

    expect(text(container)).toContain('Input was not understood');
    expect(text(container)).toContain('Pricing status restricted');

    unmount();
  });
});

describe('ComparisonView', () => {
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

function text(container: HTMLElement): string {
  return container.textContent ?? '';
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
