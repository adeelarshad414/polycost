import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { DataHealthResponse } from '../../types';
import { LandingHero } from './LandingHero';

function health(rows: number[], ages: Array<number | undefined>): DataHealthResponse {
  return {
    providers: rows.map((currentRateRows, index) => ({
      providerId: ['aws', 'azure', 'gcp'][index],
      ageHours: ages[index],
      cache: { currentRateRows },
    })),
  } as unknown as DataHealthResponse;
}

describe('LandingHero', () => {
  it('leads with the promise, two ways in, live proof points and a labelled sample', async () => {
    const onStart = jest.fn();
    const onUploadDiagram = jest.fn();
    const { container } = render(
      <LandingHero
        title="Multi-cloud cost clarity, in one place."
        subtitle="Compare costs side by side."
        dataHealth={health([1418, 8708, 105], [26, 6, 552])}
        onStart={onStart}
        onUploadDiagram={onUploadDiagram}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Multi-cloud cost clarity, in one place.',
    );
    expect(screen.getByText('10,231')).toBeTruthy();
    expect(screen.getByText('6 h')).toBeTruthy();
    expect(screen.getByText('Sample result')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start a comparison' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload a diagram' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onUploadDiagram).toHaveBeenCalledTimes(1);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows dashes without pricing data and words ages in hours or days', () => {
    const { rerender } = render(
      <LandingHero
        title="t"
        subtitle="s"
        dataHealth={null}
        onStart={jest.fn()}
        onUploadDiagram={jest.fn()}
      />,
    );
    expect(screen.getAllByText('—')).toHaveLength(2);

    rerender(
      <LandingHero
        title="t"
        subtitle="s"
        dataHealth={health([1], [0.5])}
        onStart={jest.fn()}
        onUploadDiagram={jest.fn()}
      />,
    );
    expect(screen.getByText('<1 h')).toBeTruthy();

    rerender(
      <LandingHero
        title="t"
        subtitle="s"
        dataHealth={health([1], [96])}
        onStart={jest.fn()}
        onUploadDiagram={jest.fn()}
      />,
    );
    expect(screen.getByText('4 d')).toBeTruthy();
  });
});
