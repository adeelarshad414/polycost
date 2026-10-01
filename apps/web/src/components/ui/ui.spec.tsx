import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Badge, Card, EmptyState, KpiTile, ProvenancePill, Skeleton } from './index';

describe('Aurora component set', () => {
  it('renders a card with eyebrow, heading, actions and the accent hairline', async () => {
    const { container } = render(
      <Card
        eyebrow="Cost by service"
        title="Azure monthly breakdown"
        actions={<button>Export</button>}
        accent
      >
        <p>Body</p>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Azure monthly breakdown' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(container.querySelector('.ui-card')?.classList.contains('ui-card-accent')).toBe(true);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('renders a card without a header when none is given', () => {
    const { container } = render(<Card as="section">Only body</Card>);

    expect(container.querySelector('section.ui-card')).toBeTruthy();
    expect(container.querySelector('.ui-card-header')).toBeNull();
  });

  it('renders a KPI tile with tone, provider mark, delta and sparkline', async () => {
    const { container } = render(
      <KpiTile
        label="Cheapest provider"
        value="Azure"
        detail="$122.96 monthly"
        tone="positive"
        providerId="azure"
        delta={{ label: '8% below AWS', direction: 'down', tone: 'good' }}
        sparkline={<span>spark</span>}
      />,
    );

    expect(screen.getByText('Azure')).toBeTruthy();
    expect(screen.getByText('8% below AWS')).toBeTruthy();
    expect(container.querySelector('.ui-kpi-positive')).toBeTruthy();
    expect(container.querySelector('.ui-provider-dot-azure')).toBeTruthy();
    expect(container.querySelector('.ui-delta-good')).toBeTruthy();
    expect(container.querySelector('.ui-kpi-sparkline')).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it.each(['up', 'flat'] as const)(
    'draws a %s delta arrow with a neutral default tone',
    (direction) => {
      const { container } = render(
        <KpiTile label="Spend" value="$1" delta={{ label: 'change', direction }} />,
      );

      expect(container.querySelector('.ui-delta-neutral path')?.getAttribute('d')).toBe(
        direction === 'up' ? 'M6 15l6-6 6 6' : 'M6 12h12',
      );
    },
  );

  it('maps provenance to live and estimate tones with readable labels', () => {
    render(
      <>
        <ProvenancePill provenance="live" />
        <ProvenancePill provenance="seed" detail="Uses seed pricing, not live rates." />
        <ProvenancePill provenance="sample" label="Part sample data" />
      </>,
    );

    expect(screen.getByText('Live pricing').className).toContain('ui-badge-success');
    expect(screen.getByText('Seed data').getAttribute('title')).toBe(
      'Uses seed pricing, not live rates.',
    );
    expect(screen.getByText('Part sample data').className).toContain('ui-badge-estimate');
  });

  it('renders badges in each tone', () => {
    render(<Badge tone="danger">Over budget</Badge>);

    expect(screen.getByText('Over budget').className).toContain('ui-badge-danger');
  });

  it('announces a skeleton and draws the requested number of lines', () => {
    const { container } = render(<Skeleton lines={4} label="Loading chart" />);

    expect(screen.getByRole('status', { name: 'Loading chart' })).toBeTruthy();
    expect(container.querySelectorAll('.ui-skeleton-line')).toHaveLength(4);
  });

  it('renders an empty state with one sentence and one action', async () => {
    const { container } = render(
      <EmptyState
        title="No commitment pricing yet"
        description="Choose a 1- or 3-year scenario to see the break-even."
        action={<button>Show reserved pricing</button>}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('No commitment pricing yet');
    expect(screen.getByRole('button', { name: 'Show reserved pricing' })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('renders an empty state with a custom icon and no description', () => {
    const { container } = render(<EmptyState title="Nothing here" icon={<span>*</span>} />);

    expect(container.querySelector('.ui-empty-description')).toBeNull();
    expect(container.querySelector('.ui-empty-icon')?.textContent).toBe('*');
  });
});
