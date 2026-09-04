import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared chart presentation.
 *
 * The charts were drawn with flat fills, an empty donut hole and a default
 * tooltip, so they read as output rather than as part of the product. This
 * holds the pieces every chart should share, so a new one inherits the look
 * instead of re-deciding it.
 *
 * Colours are never literals here - they come through as CSS variables so the
 * charts follow the theme, including dark, and stay inside the repository's
 * theme-hex guard.
 */

/** Tooltip surface, matched to the card elevation rather than recharts' default. */
export const chartTooltipStyle: CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-control)',
  boxShadow: 'var(--shadow-card)',
  color: 'var(--ink-900)',
  fontSize: '12px',
  padding: '8px 10px',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--ink-400)',
  fontSize: '11px',
  marginBottom: '2px',
};

export const chartAxisTick = {
  fill: 'var(--ink-400)',
  fontSize: 10,
} as const;

/**
 * A vertical gradient per series colour.
 *
 * Flat bars and segments read as filled rectangles; a slight vertical fade gives
 * them a light source and stops a row of them looking like a colour swatch
 * chart. The fade is deliberately shallow - strong enough to see, not so strong
 * that two adjacent categories become hard to compare, which is the failure mode
 * of decorative gradients on quantitative marks.
 */
export function ChartGradients({ ids }: { ids: Array<{ id: string; color: string }> }): ReactNode {
  return (
    <defs>
      {ids.map(({ id, color }) => (
        <linearGradient id={id} key={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={1} />
          <stop offset="100%" stopColor={color} stopOpacity={0.72} />
        </linearGradient>
      ))}
    </defs>
  );
}

/** SVG ids must be unique per chart instance or gradients bleed between them. */
export function gradientId(scope: string, key: string): string {
  return `chart-grad-${scope}-${key}`;
}
