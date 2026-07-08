import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { BootSplash, ProgressBar, SessionLoader, Skeleton, TaskQueue } from './LoadingExperience';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LoadingExperience', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-08T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delay-mounts the boot splash and avoids sub-150ms flashes', () => {
    const { container, rerender, unmount } = render(<BootSplash active />);

    act(() => {
      jest.advanceTimersByTime(149);
    });

    expect(container.querySelector('.boot-splash')).toBeNull();

    rerender(<BootSplash active={false} />);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(container.querySelector('.boot-splash')).toBeNull();
    unmount();
  });

  it('holds the boot splash briefly once shown', () => {
    const { container, rerender, unmount } = render(<BootSplash active />);

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(container.querySelector('.boot-splash')).toBeInstanceOf(HTMLElement);

    rerender(<BootSplash active={false} />);

    act(() => {
      jest.advanceTimersByTime(359);
    });

    expect(container.querySelector('.boot-splash')).toBeInstanceOf(HTMLElement);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(container.querySelector('.boot-splash')).toBeNull();
    unmount();
  });

  it('renders a staged session loader with progress semantics', () => {
    const { container, unmount } = render(
      <SessionLoader
        identity={{ name: 'Architecture Lead', detail: 'PolyCost demo team · owner' }}
        phase="Syncing team access"
        steps={[
          { id: 'session', label: 'Workspace session verified', state: 'done' },
          { id: 'team', label: 'Syncing team directory', state: 'active' },
          { id: 'sso', label: 'Checking SSO readiness', state: 'pending' },
        ]}
        trustCue
      />,
    );

    expect(container.textContent).toContain('Welcome back, Architecture');
    expect(container.textContent).toContain('Secure session');
    expect(progress(container)?.getAttribute('aria-valuenow')).toBe('50');
    expect(container.querySelector('.loading-step-active')).toBeInstanceOf(HTMLElement);

    unmount();
  });

  it('renders skeletons as hidden placeholders and task completion without an indeterminate bar', () => {
    const { container, unmount } = render(
      <>
        <Skeleton.Grid cards={2} />
        <TaskQueue
          items={[
            {
              id: 'export',
              label: 'PDF report',
              status: 'completed',
              phase: 'Downloaded',
            },
          ]}
        />
        <ProgressBar label="Measured import" value={75} phase="Importing rows" />
      </>,
    );

    expect(container.querySelector('.skeleton-grid')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.task-queue-complete-mark')?.textContent).toBe('Completed');
    expect(container.querySelector('.task-queue [role="progressbar"]')).toBeNull();
    expect(progress(container)?.getAttribute('aria-valuenow')).toBe('75');

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
