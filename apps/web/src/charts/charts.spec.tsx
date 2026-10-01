import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  CATEGORY_ORDER,
  CommitmentBreakEven,
  CostByServiceStacked,
  ProviderComparisonBar,
  RegionProviderHeatmap,
  Sparkline,
  TrendForecastArea,
  areaPath,
  bandPath,
  breakEvenMonth,
  categoryLabel,
  cumulativeSeries,
  linearScale,
  niceMax,
  providerComparison,
  providerLabel,
  sequentialStep,
  stackedByProvider,
} from './index';

const quotes = [
  { providerId: 'aws' as const, value: 132.94 },
  { providerId: 'azure' as const, value: 122.96 },
  { providerId: 'gcp' as const, value: 521.55 },
];

describe('chart grammar (models)', () => {
  it('sorts provider quotes cheapest first and measures each against the lowest', () => {
    const model = providerComparison(quotes);

    expect(model.rows.map((row) => row.providerId)).toEqual(['azure', 'aws', 'gcp']);
    expect(model.rows[0]).toMatchObject({ isLowest: true, deltaFromLowest: 0 });
    expect(model.rows[1].deltaFromLowest).toBeCloseTo(9.98, 2);
    expect(model.rows[1].deltaRatioFromLowest).toBeCloseTo(0.0812, 3);
    expect(model.rows[2].widthPercent).toBe(100);
  });

  it('never sums alternatives: the comparison model exposes no combined total', () => {
    const model = providerComparison(quotes);
    const combined = quotes.reduce((sum, quote) => sum + quote.value, 0);

    expect(JSON.stringify(model)).not.toContain(String(combined));
    expect(Object.keys(model)).toEqual(['rows', 'unpriced']);
  });

  it('reports unpriced providers instead of drawing them as zero', () => {
    const model = providerComparison([
      { providerId: 'aws', value: 10 },
      { providerId: 'azure', value: undefined },
      { providerId: 'gcp', value: Number.NaN },
    ]);

    expect(model.rows.map((row) => row.providerId)).toEqual(['aws']);
    expect(model.unpriced).toEqual(['azure', 'gcp']);
    expect(providerComparison([{ providerId: 'aws', value: undefined }]).rows).toEqual([]);
  });

  it('keeps cost categories in one fixed order and computes shares within a provider', () => {
    const [aws, gcp] = stackedByProvider([
      {
        providerId: 'aws',
        categories: [
          { category: 'support', value: 100 },
          { category: 'compute', value: 30 },
          { category: 'compute', value: 2.94 },
          { category: 'storage', value: 0 },
        ],
      },
      { providerId: 'gcp', categories: [{ category: 'compute', value: 521.55 }] },
    ]);

    expect(aws.segments.map((segment) => segment.category)).toEqual(['compute', 'support']);
    expect(aws.total).toBeCloseTo(132.94, 2);
    expect(aws.segments[0].value).toBeCloseTo(32.94, 2);
    expect(aws.segments[1].percentOfProvider).toBeCloseTo(75.22, 1);
    expect(gcp.segments[0].widthPercent).toBe(100);
    expect(CATEGORY_ORDER[0]).toBe('compute');
    expect(categoryLabel('network')).toBe('Network & egress');
    expect(providerLabel('gcp')).toBe('GCP');
  });

  it('builds scales, nice maxima and SVG paths', () => {
    const x = linearScale([0, 10], [0, 100]);
    const y = linearScale([0, 10], [100, 0]);
    const flat = linearScale([5, 5], [0, 10]);

    expect(x(5)).toBe(50);
    expect(flat(5)).toBe(0);
    expect([niceMax(0), niceMax(0.8), niceMax(130), niceMax(410), niceMax(900)]).toEqual([
      1, 1, 200, 500, 1000,
    ]);
    expect(areaPath([], x, y)).toBe('');
    expect(
      areaPath(
        [
          { x: 0, y: 5 },
          { x: 10, y: 10 },
        ],
        x,
        y,
      ),
    ).toBe('M0,50 L100,0 L100,100 L0,100 Z');
    expect(bandPath([], [], x, y)).toBe('');
    expect(bandPath([{ x: 0, y: 6 }], [{ x: 0, y: 4 }], x, y)).toBe('M0,40 L0,60 Z');
  });

  it('finds the month a commitment breaks even, or none within the horizon', () => {
    const [onDemand, reserved, never] = cumulativeSeries(
      [
        { id: 'on-demand', label: 'On-demand', upfront: 0, monthly: 100 },
        { id: '1yr', label: '1-year', upfront: 300, monthly: 60 },
        { id: '3yr', label: '3-year', upfront: 5000, monthly: 90 },
        { id: 'spot', label: 'Spot', upfront: 0, monthly: undefined },
      ],
      12,
    );

    expect(onDemand.points).toHaveLength(13);
    expect(breakEvenMonth(onDemand, reserved)).toBe(8);
    expect(breakEvenMonth(onDemand, never)).toBeUndefined();
  });

  it('maps values onto ten sequential steps', () => {
    expect([
      sequentialStep(0, 0, 100),
      sequentialStep(100, 0, 100),
      sequentialStep(50, 0, 100),
    ]).toEqual([1, 10, 6]);
    expect(sequentialStep(5, 5, 5)).toBe(1);
  });
});

describe('chart components', () => {
  it('renders the provider comparison with the lowest marked and a table view', async () => {
    const { container } = render(<ProviderComparisonBar quotes={quotes} />);

    const rows = container.querySelectorAll('.comparison-bar-row');
    expect(rows[0].classList.contains('is-lowest')).toBe(true);
    expect(rows[0].getAttribute('aria-label')).toBe('Azure: $122.96 per month, lowest');
    expect(rows[1].getAttribute('aria-label')).toContain('$9.98 (8.1%) above the lowest');
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByRole('rowheader', { name: 'Azure' })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'View as chart' }));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists unpriced providers and handles an all-unpriced comparison', () => {
    const { rerender } = render(
      <ProviderComparisonBar
        period="year"
        quotes={[
          { providerId: 'aws', value: 12 },
          { providerId: 'gcp', value: undefined },
        ]}
      />,
    );
    expect(screen.getByText('— Not priced for this workload')).toBeTruthy();
    expect(screen.getByText('USD per year, lowest first')).toBeTruthy();

    rerender(<ProviderComparisonBar quotes={[{ providerId: 'aws', value: undefined }]} />);
    expect(screen.getByText('No provider could be priced for this workload.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('cell', { name: 'Not priced' })).toBeTruthy();
  });

  it('highlights a category across stacked bars and reports it to the parent', async () => {
    const onSelect = jest.fn();
    const { container } = render(
      <CostByServiceStacked
        onSelectCategory={onSelect}
        providers={[
          {
            providerId: 'aws',
            categories: [
              { category: 'compute', value: 30 },
              { category: 'support', value: 100 },
            ],
          },
          { providerId: 'azure', categories: [{ category: 'compute', value: 23 }] },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(onSelect).toHaveBeenLastCalledWith('support');
    expect(container.querySelectorAll('.stacked-segment.is-dimmed')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('columnheader', { name: 'Provider total' })).toBeTruthy();
    expect(screen.getAllByRole('cell', { name: '—' })).toHaveLength(1);
  });

  it('follows a controlled category and hides the filter for a single category', () => {
    const { container, rerender } = render(
      <CostByServiceStacked
        selectedCategory="compute"
        providers={[
          {
            providerId: 'aws',
            categories: [
              { category: 'compute', value: 1 },
              { category: 'storage', value: 1 },
            ],
          },
        ]}
      />,
    );
    expect(container.querySelectorAll('.stacked-segment.is-dimmed')).toHaveLength(1);

    rerender(
      <CostByServiceStacked
        providers={[{ providerId: 'aws', categories: [{ category: 'compute', value: 1 }] }]}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Highlight a category' })).toBeNull();
  });

  it('draws trend, forecast band and budget, and reads periods with the keyboard', async () => {
    const { container } = render(
      <TrendForecastArea
        labels={['Jan', 'Feb', 'Mar', 'Apr']}
        actual={[100, 120, 118, undefined]}
        forecast={[undefined, undefined, 118, 130]}
        forecastLow={[undefined, undefined, 118, 120]}
        forecastHigh={[undefined, undefined, 118, 140]}
        budget={125}
      />,
    );

    expect(container.querySelector('.chart-line-actual')).toBeTruthy();
    expect(container.querySelector('.chart-line-forecast')).toBeTruthy();
    expect(container.querySelector('.chart-band')).toBeTruthy();
    expect(screen.getByText('⚠ Budget $125.00')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Actual',
      'Forecast',
      'Budget',
    ]);

    const plot = screen.getByRole('img');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toBe('Feb · Actual $120.00');
    fireEvent.keyDown(plot, { key: 'End' });
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toBe('Jan · Actual $100.00');
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      fireEvent.mouseEnter(container.querySelectorAll('.chart-hit')[3]);
    });
    expect(screen.getByRole('status').textContent).toBe('Apr · Forecast $130.00');
    fireEvent.mouseLeave(plot);
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  it('draws a single-series trend without legend or forecast', () => {
    render(<TrendForecastArea labels={['Jan']} actual={[undefined]} />);

    expect(screen.queryByRole('list')).toBeNull();
    const plot = screen.getByRole('img');
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toBe('Jan');
  });

  it('marks the break-even month and lists unpriced terms', async () => {
    const { container } = render(
      <CommitmentBreakEven
        months={12}
        terms={[
          { id: 'on-demand', label: 'On-demand', upfront: 0, monthly: 100 },
          { id: '1yr', label: '1-year', upfront: 300, monthly: 60 },
          { id: '3yr', label: '3-year', upfront: 0, monthly: undefined },
        ]}
      />,
    );

    expect(screen.getByText('1-year pays off at month 8')).toBeTruthy();
    expect(screen.getByText('— 3-year: no pricing in catalog')).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('cell', { name: 'Month 8' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'No pricing in catalog' })).toBeTruthy();
  });

  it('explains an empty break-even and one that never pays off', () => {
    const { rerender } = render(
      <CommitmentBreakEven
        terms={[{ id: 'on-demand', label: 'On-demand', upfront: 0, monthly: 1 }]}
      />,
    );
    expect(screen.getByText(/Add a 1- or 3-year commitment price/)).toBeTruthy();

    rerender(
      <CommitmentBreakEven
        months={6}
        terms={[
          { id: 'on-demand', label: 'On-demand', upfront: 0, monthly: 10 },
          { id: 'custom', label: 'Custom', upfront: 999, monthly: 9 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('cell', { name: 'Not within 6 months' })).toBeTruthy();
  });

  it('shades a region heatmap, outlines the cheapest cell and marks gaps', async () => {
    const { container } = render(
      <RegionProviderHeatmap
        regions={[
          { id: 'use1', label: 'US East' },
          { id: 'euw1', label: 'EU West' },
        ]}
        providers={['aws', 'azure']}
        values={{ use1: { aws: 100, azure: 90 }, euw1: { aws: 140 } }}
      />,
    );

    expect(screen.getByLabelText('US East, Azure: $90.00, cheapest').className).toContain(
      'is-cheapest',
    );
    expect(screen.getByLabelText('EU West, AWS: $140.00').className).toContain('is-strong');
    expect(container.querySelectorAll('.heatmap-cell.is-missing')).toHaveLength(1);
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('cell', { name: '—' })).toBeTruthy();
  });

  it('draws a sparkline only when there is a trend to show', () => {
    const { container, rerender } = render(
      <Sparkline values={[1, 3, 2]} colorToken="--provider-aws" />,
    );
    expect(container.querySelector('.sparkline path')).toBeTruthy();

    rerender(<Sparkline values={[1]} />);
    expect(container.querySelector('.sparkline')).toBeNull();
  });
});
