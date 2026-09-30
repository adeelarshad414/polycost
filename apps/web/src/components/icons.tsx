/*
  Presentational icons. UI-2 moved these from thirteen hand-drawn paths to one
  icon set (lucide) so stroke weight, corner style and optical size match across
  the app. The exported names are unchanged, so call sites did not move. Every
  icon is decorative (aria-hidden); the control it sits in carries the name.
*/
import {
  AlignLeft,
  BarChart3,
  Boxes,
  Download,
  ExternalLink,
  FileText,
  GitCompareArrows,
  LayoutGrid,
  List,
  LogIn,
  RefreshCw,
  ScanText,
  ShieldCheck,
  TrendingUp,
  Upload,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { InputMode } from '../lib/app-view-types';
import type { PricingModelKey } from '../types';

const STROKE_WIDTH = 1.75;

function renderIcon(Icon: LucideIcon, className: 'button-icon' | 'segment-icon') {
  return <Icon aria-hidden="true" className={className} strokeWidth={STROKE_WIDTH} />;
}

export function SignInIcon() {
  return renderIcon(LogIn, 'button-icon');
}

export function ShieldIcon() {
  return renderIcon(ShieldCheck, 'button-icon');
}

export function CompareIcon() {
  return renderIcon(GitCompareArrows, 'button-icon');
}

export function ParseIcon() {
  return renderIcon(ScanText, 'button-icon');
}

export function UploadIcon() {
  return renderIcon(Upload, 'button-icon');
}

export function ModeIcon({ mode }: { mode: InputMode }) {
  const Icon = mode === 'describe' ? AlignLeft : mode === 'diagram' ? Workflow : LayoutGrid;
  return renderIcon(Icon, 'segment-icon');
}

export function PricingModelMiniIcon({ pricingModel }: { pricingModel: PricingModelKey }) {
  const Icon =
    pricingModel === 'spot' ? TrendingUp : pricingModel === 'on-demand' ? List : BarChart3;
  return renderIcon(Icon, 'segment-icon');
}

export function SampleIcon() {
  return renderIcon(FileText, 'button-icon');
}

export function RefreshIcon() {
  return renderIcon(RefreshCw, 'button-icon');
}

export function DownloadIcon() {
  return renderIcon(Download, 'button-icon');
}

export function TerraformIcon() {
  return renderIcon(Boxes, 'button-icon');
}

export function ExternalLinkIcon() {
  return renderIcon(ExternalLink, 'button-icon');
}

export function ClearIcon() {
  return renderIcon(X, 'button-icon');
}
