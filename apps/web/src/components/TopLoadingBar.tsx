import { useEffect, useState } from 'react';

type LoadingPhase = 'idle' | 'loading' | 'complete';
const LOADING_DELAY_MS = 150;
const COMPLETE_MIN_VISIBLE_MS = 320;

interface TopLoadingBarProps {
  isLoading: boolean;
  label?: string;
}

export function TopLoadingBar({ isLoading, label = 'Page loading' }: TopLoadingBarProps) {
  const [phase, setPhase] = useState<LoadingPhase>('idle');

  useEffect(() => {
    if (isLoading) {
      if (phase === 'loading') {
        return undefined;
      }

      const timeout = window.setTimeout(() => setPhase('loading'), LOADING_DELAY_MS);
      return () => window.clearTimeout(timeout);
    }

    if (phase !== 'loading') {
      return undefined;
    }

    setPhase('complete');
    return undefined;
  }, [isLoading, phase]);

  useEffect(() => {
    if (phase !== 'complete') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setPhase('idle'), COMPLETE_MIN_VISIBLE_MS);

    return () => window.clearTimeout(timeout);
  }, [phase]);

  if (phase === 'idle') {
    return null;
  }

  const isComplete = phase === 'complete';

  return (
    <div
      className="fixed inset-x-0 top-0 z-[80] h-[3px] overflow-hidden bg-transparent pointer-events-none"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isComplete ? 100 : 80}
    >
      <span
        className={[
          'top-loading-bar-fill origin-left',
          isComplete
            ? 'is-complete scale-x-100 motion-reduce:transition-none'
            : 'is-sweeping scale-x-100',
        ].join(' ')}
      />
    </div>
  );
}
