import { useEffect, useRef, useState, type ReactNode } from 'react';

export type LoadingStepState = 'done' | 'active' | 'pending' | 'failed';
export type TaskQueueItemStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface LoadingStep {
  id: string;
  label: string;
  state: LoadingStepState;
  detail?: string;
}

export interface ProgressBarProps {
  label: string;
  value?: number;
  phase?: string;
  max?: number;
  variant?: 'determinate' | 'indeterminate';
}

export interface SessionLoaderProps {
  productName?: string;
  eyebrow?: string;
  identity?: {
    name: string;
    detail?: string;
    initials?: string;
  };
  progress?: number;
  phase: string;
  steps: LoadingStep[];
  trustCue?: boolean;
  compact?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export interface TaskQueueItem {
  id: string;
  label: string;
  status: TaskQueueItemStatus;
  phase?: string;
  progress?: number;
  error?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

const LOADER_DELAY_MS = 150;
const MIN_FULL_SURFACE_MS = 360;

export function BootSplash({
  active,
  label = 'Loading PolyCost',
}: {
  active: boolean;
  label?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (isVisible) {
        return undefined;
      }

      const timeout = window.setTimeout(() => {
        shownAt.current = Date.now();
        setIsVisible(true);
      }, LOADER_DELAY_MS);
      return () => window.clearTimeout(timeout);
    }

    if (!isVisible) {
      return undefined;
    }

    const elapsed = shownAt.current ? Date.now() - shownAt.current : MIN_FULL_SURFACE_MS;
    const remaining = Math.max(0, MIN_FULL_SURFACE_MS - elapsed);
    const timeout = window.setTimeout(() => setIsVisible(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [active, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="boot-splash" aria-busy="true" aria-label={label} role="status">
      <div className="boot-splash-mark" aria-hidden="true">
        <span className="boot-splash-ring boot-splash-ring-one" />
        <span className="boot-splash-ring boot-splash-ring-two" />
        <span className="polycost-mini-mark">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

export function SessionLoader({
  productName = 'PolyCost',
  eyebrow = 'WORKSPACE',
  identity,
  progress,
  phase,
  steps,
  trustCue = false,
  compact = false,
  error,
  onRetry,
}: SessionLoaderProps) {
  const normalizedProgress = clampProgress(progress ?? progressFromSteps(steps));

  return (
    <section
      className={compact ? 'session-loader session-loader-compact' : 'session-loader'}
      aria-busy={!error}
      aria-label={error ? 'Workspace loading failed' : 'Workspace loading'}
    >
      <div className="session-loader-card">
        <div className="session-loader-mark" aria-hidden="true">
          <span className="polycost-mini-mark">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="session-loader-title">
          <strong>{productName}</strong>
          <span>{eyebrow}</span>
        </div>
      </div>

      {identity ? (
        <div className="session-loader-identity">
          <span className="session-loader-avatar" aria-hidden="true">
            {identity.initials ?? initialsFromName(identity.name)}
          </span>
          <div>
            <strong>Welcome back, {firstName(identity.name)}</strong>
            {identity.detail ? <span>{identity.detail}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="session-loader-progress">
        <strong>{Math.round(normalizedProgress)}%</strong>
        <ProgressBar label={phase} value={normalizedProgress} phase={phase} />
      </div>

      <LoadingChecklist steps={steps} />

      {error ? (
        <div className="session-loader-error" role="alert">
          <strong>Workspace loading failed</strong>
          <span>{error}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {error ? `Workspace loading failed. ${error}` : phase}
      </span>

      {trustCue ? (
        <div className="session-loader-trust">
          <span aria-hidden="true" />
          <strong>Secure session</strong>
        </div>
      ) : null}
    </section>
  );
}

export function LoadingChecklist({ steps }: { steps: LoadingStep[] }) {
  return (
    <ol className="loading-checklist" aria-label="Loading steps">
      {steps.map((step) => (
        <li key={step.id} className={`loading-step loading-step-${step.state}`}>
          <span className="loading-step-indicator" aria-hidden="true">
            {step.state === 'done' ? '✓' : step.state === 'failed' ? '×' : ''}
          </span>
          <span>
            <strong>{step.label}</strong>
            {step.detail ? <small>{step.detail}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ProgressBar({
  label,
  value,
  phase,
  max = 100,
  variant = value === undefined ? 'indeterminate' : 'determinate',
}: ProgressBarProps) {
  const isDeterminate = variant === 'determinate' && value !== undefined;
  const rawValue = value ?? 0;
  const progressScale = isDeterminate ? clampProgress((rawValue / max) * 100) / 100 : 0;

  return (
    <div className="progress-meter">
      <div
        className={`progress-meter-track ${isDeterminate ? 'is-determinate' : 'is-indeterminate'}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={isDeterminate ? Math.round(rawValue) : undefined}
      >
        <span style={isDeterminate ? { transform: `scaleX(${progressScale})` } : undefined} />
      </div>
      {phase ? <small>{phase}</small> : null}
    </div>
  );
}

export const Skeleton = {
  Text: SkeletonText,
  Card: SkeletonCard,
  Table: SkeletonTable,
  Chart: SkeletonChart,
  Grid: SkeletonGrid,
};

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = '7rem' }: { height?: string }) {
  return (
    <div className="skeleton-card" style={{ minHeight: height }} aria-hidden="true">
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      <span className="skeleton-table-header" />
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="skeleton-table-row" />
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="skeleton-chart" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function SkeletonGrid({ cards = 3 }: { cards?: number }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function LoadingStatus({
  title,
  detail,
  progress,
}: {
  title: string;
  detail: string;
  progress?: number;
}) {
  return (
    <div className="loading-status" aria-busy="true" role="status">
      <ProgressBar
        label={title}
        value={progress}
        phase={title}
        variant={progress === undefined ? 'indeterminate' : 'determinate'}
      />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function TaskQueue({ items }: { items: TaskQueueItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="task-queue" aria-label="Background activity">
      {items.map((item) => (
        <article key={item.id} className={`task-queue-item task-queue-${item.status}`}>
          <div>
            <span>{taskStatusLabel(item.status)}</span>
            <strong>{item.label}</strong>
            {item.phase ? <small>{item.phase}</small> : null}
            {item.error ? <small role="alert">{item.error}</small> : null}
          </div>
          {item.status === 'completed' && item.progress === undefined ? (
            <span className="task-queue-complete-mark">Completed</span>
          ) : (
            <ProgressBar
              label={`${item.label} ${taskStatusLabel(item.status)}`}
              value={item.progress}
              phase={item.status === 'running' ? item.phase : undefined}
              variant={item.progress === undefined ? 'indeterminate' : 'determinate'}
            />
          )}
          <div className="task-queue-actions">
            {item.onCancel && item.status === 'running' ? (
              <button type="button" onClick={item.onCancel}>
                Cancel
              </button>
            ) : null}
            {item.onRetry && item.status === 'failed' ? (
              <button type="button" onClick={item.onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

export function JobToast({
  title,
  detail,
  status,
  action,
}: {
  title: string;
  detail: string;
  status: TaskQueueItemStatus;
  action?: ReactNode;
}) {
  return (
    <div
      className={`job-toast job-toast-${status}`}
      role={status === 'failed' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {action}
    </div>
  );
}

export function LiveTail({
  label = 'Live',
  detail = 'streaming',
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div className="live-tail" role="status">
      <span aria-hidden="true" />
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  );
}

function progressFromSteps(steps: LoadingStep[]): number {
  if (steps.length === 0) {
    return 0;
  }

  const done = steps.filter((step) => step.state === 'done').length;
  const active = steps.some((step) => step.state === 'active') ? 0.5 : 0;
  return ((done + active) / steps.length) * 100;
}

function taskStatusLabel(status: TaskQueueItemStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
  }
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}
