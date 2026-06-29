import { useEffect, useState } from 'react';

type LoadingPhase = 'idle' | 'loading' | 'complete';

interface TopLoadingBarProps {
  isLoading: boolean;
  label?: string;
}

export function TopLoadingBar({ isLoading, label = 'Page loading' }: TopLoadingBarProps) {
  const [phase, setPhase] = useState<LoadingPhase>(() => (isLoading ? 'loading' : 'idle'));

  useEffect(() => {
    if (isLoading) {
      setPhase('loading');
      return undefined;
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

    const timeout = window.setTimeout(() => setPhase('idle'), 220);

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
          'top-loading-bar-fill block h-full w-full origin-left',
          isComplete
            ? 'scale-x-100 opacity-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none'
            : 'scale-x-[0.8] animate-top-loading-grow motion-reduce:scale-x-100 motion-reduce:animate-none',
        ].join(' ')}
      />
    </div>
  );
}
