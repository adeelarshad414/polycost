import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { VarianceChart, varianceRows } from './index';

describe('variance model', () => {
  it('centres on zero and steps the diverging shade by magnitude', () => {
    const [under, over, even, big] = varianceRows([
      { key: 'a', label: 'AWS', estimate: 100, actual: 96 },
      { key: 'b', label: 'Azure', estimate: 100, actual: 110 },
      { key: 'c', label: 'GCP', estimate: 100, actual: 100 },
      { key: 'd', label: 'Other', estimate: 100, actual: 140 },
    ]);

    expect([under.direction, under.step]).toEqual(['under', 1]);
    expect([over.direction, over.step]).toEqual(['over', 2]);
    expect(even.direction).toBe('even');
    expect([big.step, big.widthPercent]).toEqual([3, 100]);
    expect(over.widthPercent).toBe(25);
    expect(varianceRows([{ key: 'z', label: 'Z', estimate: 0, actual: 5 }])[0].ratio).toBe(0);
  });
});

describe('VarianceChart', () => {
  it('draws under and over bars on either side with signed values and a table', async () => {
    const { container } = render(
      <VarianceChart
        rows={[
          { key: 'a', label: 'AWS', estimate: 100, actual: 90 },
          { key: 'b', label: 'Azure', estimate: 100, actual: 112 },
          { key: 'c', label: 'GCP', estimate: 50, actual: 50 },
        ]}
      />,
    );

    expect(container.querySelector('.variance-half-under .div-under-2')).toBeTruthy();
    expect(container.querySelector('.variance-half-over .div-over-2')).toBeTruthy();
    expect(screen.getByText('−$10.00 (−10%)')).toBeTruthy();
    expect(screen.getByText('+$12.00 (+12%)')).toBeTruthy();
    expect(screen.getByText('On estimate')).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('columnheader', { name: 'Invoiced' })).toBeTruthy();
  });

  it('explains how to get data when there is none', () => {
    render(<VarianceChart rows={[]} />);
    expect(screen.getByText(/Import a provider bill/)).toBeTruthy();
  });
});
