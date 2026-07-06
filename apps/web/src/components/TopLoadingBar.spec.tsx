import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { TopLoadingBar } from './TopLoadingBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TopLoadingBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders loading and completion states with accessible progress semantics', () => {
    const { container, rerender, unmount } = render(<TopLoadingBar isLoading label="Refreshing" />);

    expect(progress(container)?.getAttribute('aria-label')).toBe('Refreshing');
    expect(progress(container)?.getAttribute('aria-valuenow')).toBe('80');
    expect(container.querySelector('.top-loading-bar-fill.is-sweeping')).toBeInstanceOf(
      HTMLElement,
    );

    rerender(<TopLoadingBar isLoading={false} label="Refreshing" />);

    expect(progress(container)?.getAttribute('aria-valuenow')).toBe('100');
    expect(container.querySelector('.top-loading-bar-fill.is-complete')).toBeInstanceOf(
      HTMLElement,
    );

    act(() => {
      jest.advanceTimersByTime(220);
    });

    expect(progress(container)).toBeNull();
    unmount();
  });

  it('does not render while idle', () => {
    const { container, unmount } = render(<TopLoadingBar isLoading={false} />);

    expect(progress(container)).toBeNull();
    unmount();
  });
});

function render(element: React.ReactElement): {
  container: HTMLDivElement;
  rerender: (nextElement: React.ReactElement) => void;
  unmount: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    flushSync(() => root.render(element));
  });

  return {
    container,
    rerender: (nextElement) => {
      act(() => {
        flushSync(() => root.render(nextElement));
      });
    },
    unmount: () => {
      act(() => {
        flushSync(() => root.unmount());
      });
      container.remove();
    },
  };
}

function progress(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[role="progressbar"]');
}
