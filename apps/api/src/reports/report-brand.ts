/**
 * Brand palette for exported reports (PolyCost Aurora, UI-8).
 *
 * One source of truth shared by the PDF and XLSX exporters, and the same values
 * as the web app's tokens (apps/web/src/styles/tokens.css), so a provider is the
 * same colour on screen, in a PDF chart and on a spreadsheet tab.
 *
 * Provider fills are re-stepped from the vendors' published colours: the official
 * AWS orange #FF9900 and Google green #34A853 collapse into one another under
 * protanopia, and telling the three providers apart is the whole job of these
 * charts. The Aurora steps pass a colour-vision-deficiency validator (see the UI
 * audit, section 10.4). No vendor logo is drawn.
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
  aws: { primary: 'E98A15', deep: '9A4F00', tint: 'FDF1E3', label: 'AWS' },
  azure: { primary: '3B6FE8', deep: '1D4ED8', tint: 'E8EFFD', label: 'Azure' },
  gcp: { primary: '0F7A43', deep: '0B6B3A', tint: 'E4F4EB', label: 'Google Cloud' },
};

/** Aurora brand colours, for the report header hairline and accents only. */
export const BRAND_ACCENTS = {
  indigo: '4F46E5',
  violet: '7C3AED',
  magenta: 'DB2777',
  cyan: '0891B2',
};

/** Sequential indigo ramp (light to dark) for single-hue magnitude shading. */
export const SEQUENTIAL_RAMP = [
  'EEF0FF',
  'DCE0FF',
  'C0C7FE',
  '9EA8FB',
  '7C84F4',
  '5F63E8',
  '4F46E5',
  '4036BF',
  '332C96',
  '272370',
];

/**
 * Service-category colours in the same fixed order as the web charts. Seven
 * categories need a qualitative set; this order clears the CVD checks for
 * adjacent stacked segments. Categories never borrow a provider's identity.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  compute: '4A3AA7',
  storage: '1BAF7A',
  database: 'EDA100',
  network: 'E87BA4',
  support: '008300',
  licensing: '2A78D6',
  operations: 'EB6834',
  other: '565C74',
};

/** Neutrals. Kept out of the brand hues so text never competes with data. */
export const REPORT_INK = {
  heading: '0F1222',
  body: '2E3348',
  muted: '565C74',
  hairline: 'E4E7F0',
  bandFill: 'EEF0F8',
  zebraFill: 'F5F6FB',
  paper: 'FFFFFF',
  /** Data-bar fill: light indigo that keeps black numerals at 11:1 or better. */
  dataBar: 'C0C7FE',
};

/** Status colours for confidence and risk; each clears 4.5:1 on white. */
export const STATUS_COLORS = {
  good: '047857',
  warning: 'A14A08',
  danger: 'C2263B',
};

export function providerBrand(providerId: string): BrandColors {
  return (
    PROVIDER_BRAND[providerId as keyof typeof PROVIDER_BRAND] ?? {
      primary: '565C74',
      deep: '2E3348',
      tint: 'EEF0F8',
      label: providerId.toUpperCase(),
    }
  );
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}
