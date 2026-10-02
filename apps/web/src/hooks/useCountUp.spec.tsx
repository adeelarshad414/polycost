import { act, render } from '@testing-library/react';
import { useCountUp } from './useCountUp';

function Probe({ target }: { target: number }) {
  return <span>{useCountUp(target, 100).toFixed(2)}</span>;
}

function mockMotion(reduced: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({ matches: reduced }) as never;
}

describe('useCountUp', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.useRealTimers();
  });

  it('shows the final value at once when the user prefers reduced motion', () => {
    mockMotion(true);
    const { container } = render(<Probe target={122.96} />);
    expect(container.textContent).toBe('122.96');
  });

  it('counts up from zero and settles exactly on the target', () => {
    mockMotion(false);
    jest.useFakeTimers();
    const { container } = render(<Probe target={50} />);
    expect(container.textContent).toBe('0.00');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(container.textContent).toBe('50.00');
  });
});
