import { createElement, type ReactElement } from 'react';
import { IRIS_ART, type IrisNode, type IrisPose } from './iris-art';

export type { IrisPose } from './iris-art';

export interface IrisProps {
  pose: IrisPose;
  /** Rendered width in px; height follows the square viewBox. Clamped to at least 48. */
  size?: number;
  /**
   * Wrap Iris in the white "sticker" tile. Left unset, the tile follows the
   * theme (on in dark, off in light), decided in CSS so it tracks Light / Dark /
   * System without JavaScript.
   */
  tile?: boolean;
  className?: string;
}

const MIN_SIZE = 48;

/**
 * Iris, the PolyCost mascot: a gem-bodied owl whose prism splits one beam into
 * three equal beams (AWS, Azure, GCP). Decorative only - always aria-hidden;
 * the surrounding text carries the meaning.
 *
 * Deliberately no prop can recolour, resize, hide or emphasise a single beam:
 * Iris never picks a provider. Never place her inside a chart, the evidence
 * tables, login, the share-link password dialog or a destructive confirmation
 * (docs: handover/DESIGN-SYSTEM.md, "Illustration: Iris").
 */
export function Iris({ pose, size = 120, tile, className }: IrisProps) {
  const px = Math.max(MIN_SIZE, Math.round(size));
  const tileClass =
    tile === undefined ? 'iris--tile-auto' : tile ? 'iris--tile-on' : 'iris--tile-off';

  return (
    <span className={['iris', tileClass, className].filter(Boolean).join(' ')} aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 240 240"
        width={px}
        height={px}
        aria-hidden="true"
        focusable="false"
        data-iris-pose={pose}
      >
        {IRIS_ART[pose].map(renderNode)}
      </svg>
    </span>
  );
}

function renderNode(node: IrisNode, index: number): ReactElement {
  const [tag, attrs, children] = node;
  return createElement(tag, { key: index, ...attrs }, children?.map(renderNode));
}
