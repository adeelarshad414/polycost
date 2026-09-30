import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Aurora component set (UI-2).
 *
 * Small, composable primitives that read only semantic tokens from
 * styles/tokens.css, so every surface in the app draws from one vocabulary
 * instead of re-deciding card, tile and badge styling per feature.
 */

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Right-aligned header content, e.g. an action or a badge. */
  actions?: ReactNode;
  /** 2px brand-gradient hairline along the top edge, for the one card that leads a view. */
  accent?: boolean;
  as?: 'article' | 'section' | 'div';
}

export function Card({
  eyebrow,
  title,
  actions,
  accent = false,
  as: Element = 'article',
  className,
  children,
  ...props
}: CardProps) {
  const hasHeader = eyebrow !== undefined || title !== undefined || actions !== undefined;

  return (
    <Element className={cx('ui-card', accent && 'ui-card-accent', className)} {...props}>
      {hasHeader ? (
        <header className="ui-card-header">
          <div className="ui-card-heading">
            {eyebrow !== undefined ? <span className="ui-eyebrow">{eyebrow}</span> : null}
            {title !== undefined ? <h3 className="ui-card-title">{title}</h3> : null}
          </div>
          {actions !== undefined ? <div className="ui-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Element>
  );
}

export type KpiTone = 'neutral' | 'positive' | 'attention';
export type DeltaDirection = 'up' | 'down' | 'flat';

export interface KpiTileProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: KpiTone;
  delta?: { label: ReactNode; direction: DeltaDirection; tone?: 'good' | 'bad' | 'neutral' };
  /** Optional provider identity: a small provider-coloured mark beside the label. */
  providerId?: 'aws' | 'azure' | 'gcp';
  sparkline?: ReactNode;
  className?: string;
}

/** One headline number with its label, context line and optional delta chip. */
export function KpiTile({
  label,
  value,
  detail,
  tone = 'neutral',
  delta,
  providerId,
  sparkline,
  className,
}: KpiTileProps) {
  return (
    <article className={cx('ui-kpi', `ui-kpi-${tone}`, className)}>
      <span className="ui-kpi-label">
        {providerId ? (
          <i className={`ui-provider-dot ui-provider-dot-${providerId}`} aria-hidden="true" />
        ) : null}
        {label}
      </span>
      <strong className="ui-kpi-value">{value}</strong>
      {delta ? (
        <span className={cx('ui-delta', `ui-delta-${delta.tone ?? 'neutral'}`)}>
          <DeltaArrow direction={delta.direction} />
          {delta.label}
        </span>
      ) : null}
      {detail !== undefined ? <small className="ui-kpi-detail">{detail}</small> : null}
      {sparkline ? <div className="ui-kpi-sparkline">{sparkline}</div> : null}
    </article>
  );
}

function DeltaArrow({ direction }: { direction: DeltaDirection }) {
  const path =
    direction === 'up' ? 'M6 15l6-6 6 6' : direction === 'down' ? 'M6 9l6 6 6-6' : 'M6 12h12';
  return (
    <svg className="ui-delta-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export type BadgeTone =
  'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'estimate';

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={cx('ui-badge', `ui-badge-${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export type Provenance = 'live' | 'seed' | 'sample' | 'estimate' | 'partial';

const PROVENANCE_LABEL: Record<Provenance, string> = {
  live: 'Live pricing',
  seed: 'Seed data',
  sample: 'Sample data',
  estimate: 'Estimate',
  partial: 'Part seed data',
};

/**
 * Where a number came from. Anything that is not live provider pricing uses the
 * estimate tone, so "can I trust this figure" reads the same way everywhere.
 */
export function ProvenancePill({
  provenance,
  label,
  detail,
  className,
}: {
  provenance: Provenance;
  label?: ReactNode;
  detail?: string;
  className?: string;
}) {
  return (
    <Badge
      tone={provenance === 'live' ? 'success' : 'estimate'}
      className={cx('ui-provenance', className)}
      title={detail}
    >
      <i className="ui-provenance-dot" aria-hidden="true" />
      {label ?? PROVENANCE_LABEL[provenance]}
    </Badge>
  );
}

/** Shimmering placeholder lines. Static under prefers-reduced-motion. */
export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ui-skeleton-line" />
      ))}
    </div>
  );
}

/** One sentence and, at most, one action: what is missing and how to get it. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('ui-empty', className)} role="status">
      <span className="ui-empty-icon" aria-hidden="true">
        {icon ?? <EmptyGlyph />}
      </span>
      <strong className="ui-empty-title">{title}</strong>
      {description !== undefined ? <p className="ui-empty-description">{description}</p> : null}
      {action !== undefined ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}

function EmptyGlyph() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />
    </svg>
  );
}
