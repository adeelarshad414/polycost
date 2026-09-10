/*
  Presentational SVG icons. Pure markup with no application state, lifted out of
  App.tsx as part of the K-8 decomposition: they were a contiguous block of
  thirteen and are used from several components, so they belong beside the other
  shared presentational pieces rather than in the page module.
*/
import type { InputMode } from '../lib/app-view-types';
import type { PricingModelKey } from '../types';

export function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M10 6h8v12h-8M4 12h10M11 9l3 3-3 3" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7l7-3zM9 12l2 2 4-5" />
    </svg>
  );
}

export function CompareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M4 7h16M6 7v10M18 7v10M9 17h6" />
    </svg>
  );
}

export function ParseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M5 5h14M5 12h10M5 19h7" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 17V5M8 9l4-4 4 4M5 19h14" />
    </svg>
  );
}

export function ModeIcon({ mode }: { mode: InputMode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {mode === 'describe' ? (
        <path d="M5 7h14M5 12h10M5 17h6" />
      ) : mode === 'diagram' ? (
        <path d="M5 6h14v10H5zM8 19h8M8 10h3M13 10h3M11 10l2 3" />
      ) : (
        <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />
      )}
    </svg>
  );
}

export function PricingModelMiniIcon({ pricingModel }: { pricingModel: PricingModelKey }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="segment-icon">
      {pricingModel === 'spot' ? (
        <path d="M5 17l4-8 4 5 3-6 3 9M5 20h14" />
      ) : pricingModel === 'on-demand' ? (
        <path d="M6 7h12M6 12h12M6 17h8" />
      ) : (
        <path d="M7 20V9M12 20V5M17 20v-8M5 20h14" />
      )}
    </svg>
  );
}

export function SampleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M7 4h10v16H7zM10 8h4M10 12h4M10 16h2" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M20 7v5h-5M4 17v-5h5M18.5 10A7 7 0 0 0 6.2 6.7M5.5 14a7 7 0 0 0 12.3 3.3" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />
    </svg>
  );
}

export function TerraformIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M5 5h6v6H5zM13 5h6v6h-6zM9 13h6v6H9zM11 8h2M12 11v2" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" />
    </svg>
  );
}

export function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="button-icon">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
