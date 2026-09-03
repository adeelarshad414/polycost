/**
 * Brand palette for exported reports.
 *
 * One source of truth shared by the PDF and XLSX exporters so a provider is the
 * same colour in a chart, a table header and a spreadsheet tab. Previously each
 * exporter picked its own approximate colours, so the same report looked like
 * three different documents.
 *
 * Provider colours are the vendors' own published brand values, not
 * approximations:
 *
 *   AWS    #FF9900 with #252F3E as the dark pair
 *   Azure  #027DFF, from the Azure blue ramp
 *   GCP    #4285F4, with the red/green/yellow of the Google mark
 *
 * Using a vendor's colour to label that vendor's own data is nominative use and
 * is what a reader expects; it is not co-branding, and no vendor logo is drawn.
 */

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/** '#FF9900' -> 0..1 RGB, which is what PDF content streams take. */
export function hexToRgb(hex: string): RgbColor {
  const value = hex.replace('#', '');

  return {
    red: Number.parseInt(value.slice(0, 2), 16) / 255,
    green: Number.parseInt(value.slice(2, 4), 16) / 255,
    blue: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

export interface BrandColors {
  /** Primary fill: bars, tab colours, header bands. */
  primary: string;
  /** Darker pair, used for text on light backgrounds where primary is too pale. */
  deep: string;
  /** Very light tint for table row banding and callout backgrounds. */
  tint: string;
  label: string;
}

export const PROVIDER_BRAND: Record<'aws' | 'azure' | 'gcp', BrandColors> = {
  aws: { primary: 'FF9900', deep: '252F3E', tint: 'FFF3E0', label: 'AWS' },
  azure: { primary: '027DFF', deep: '0039A9', tint: 'E6F2FF', label: 'Azure' },
  // Google green rather than Google blue, and deliberately so: #4285F4 sits
  // almost on top of Azure's #027DFF, and the whole point of these charts is
  // telling the three providers apart at a glance. Green is one of the four
  // colours of the Google mark, so this stays on-brand while staying legible.
  gcp: { primary: '34A853', deep: '1E7E34', tint: 'E6F4EA', label: 'Google Cloud' },
};

/** Azure ramp, kept for sequential shading where one hue is wanted. */
export const AZURE_RAMP = ['0039A9', '027DFF', '3399FF', '41AADE', '88D1F1', '1392D3'];

/**
 * Service-category colours, taken from the Google mark because it is the only
 * one of the three brands that supplies a full qualitative set. Categories are
 * not vendor-specific, so a neutral multi-hue palette is the right choice and
 * this one is already in the document.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  compute: '4285F4',
  storage: 'FBBC04',
  database: '34A853',
  network: 'EA4335',
  operations: '1392D3',
  other: '5F6673',
};

/** Neutrals. Kept out of the brand hues so text never competes with data. */
export const REPORT_INK = {
  heading: '111827',
  body: '1F2430',
  muted: '5B6270',
  hairline: 'D8DCE3',
  bandFill: 'F3F5F8',
  zebraFill: 'FAFBFC',
  paper: 'FFFFFF',
  /** Data-bar fill: a mid Azure blue that stays legible behind black numerals. */
  dataBar: '88D1F1',
};

/** Status colours for confidence and risk, chosen to clear AA on white. */
export const STATUS_COLORS = {
  good: '217455',
  warning: 'B26A00',
  danger: 'B3261E',
};

export function providerBrand(providerId: string): BrandColors {
  return (
    PROVIDER_BRAND[providerId as keyof typeof PROVIDER_BRAND] ?? {
      primary: '5F6673',
      deep: '30343C',
      tint: 'F1F2F4',
      label: providerId.toUpperCase(),
    }
  );
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}
