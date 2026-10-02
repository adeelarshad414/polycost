import { useEffect, useState } from 'react';

/**
 * Animates a number from 0 to `target` (UI-7). Returns the target immediately
 * when the user prefers reduced motion, when matchMedia is unavailable, or when
 * the target is not a finite number. The animation runs once per target.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(() => (shouldAnimate() ? 0 : target));

  useEffect(() => {
    if (!shouldAnimate() || !Number.isFinite(target)) {
      setValue(target);
      return undefined;
    }

    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      // Expo-out, matching --ease-emphasized: fast start, gentle settle.
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

function shouldAnimate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    typeof window.requestAnimationFrame === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
