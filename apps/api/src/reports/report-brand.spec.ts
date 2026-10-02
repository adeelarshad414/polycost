import {
  BRAND_ACCENTS,
  CATEGORY_COLORS,
  PROVIDER_BRAND,
  REPORT_INK,
  STATUS_COLORS,
  categoryColor,
  hexToRgb,
  providerBrand,
} from './report-brand.js';

function luminance(hex: string): number {
  const { red, green, blue } = hexToRgb(hex);
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('report palette (Aurora, UI-8)', () => {
  it('uses the same CVD-validated provider fills as the web app', () => {
    expect(PROVIDER_BRAND.aws.primary).toBe('E98A15');
    expect(PROVIDER_BRAND.azure.primary).toBe('3B6FE8');
    expect(PROVIDER_BRAND.gcp.primary).toBe('0F7A43');
  });

  it('keeps every text colour at 4.5:1 or better on white paper', () => {
    for (const ink of [
      REPORT_INK.heading,
      REPORT_INK.body,
      REPORT_INK.muted,
      ...Object.values(STATUS_COLORS),
      ...Object.values(PROVIDER_BRAND).map((brand) => brand.deep),
    ]) {
      expect(contrast(ink, REPORT_INK.paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps white header text legible on the indigo band and data bars legible behind ink', () => {
    expect(contrast('FFFFFF', BRAND_ACCENTS.indigo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(REPORT_INK.heading, REPORT_INK.dataBar)).toBeGreaterThanOrEqual(7);
  });

  it('never gives a cost category a provider identity colour', () => {
    const providerFills = new Set(Object.values(PROVIDER_BRAND).map((brand) => brand.primary));
    for (const color of Object.values(CATEGORY_COLORS)) {
      expect(providerFills.has(color)).toBe(false);
    }
    expect(categoryColor('unknown')).toBe(CATEGORY_COLORS.other);
    expect(providerBrand('oracle').label).toBe('ORACLE');
  });
});
