import { readFileSync } from 'node:fs';
import path from 'node:path';

// Aurora contrast guard (UI-1): every token that sets text colour must clear
// WCAG 2.2 AA (4.5:1) on every surface it can sit on, in both themes, and the
// dark values must be identical under the OS-preference and toggle selectors.
// Kept as a unit test so a token edit that regresses contrast fails the gate.

const tokensCss = readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** The body of the first rule whose selector text starts at `marker`. */
function blockAfter(marker: string): string {
  const start = tokensCss.indexOf(marker);
  if (start < 0) {
    throw new Error(`selector ${marker} not found in tokens.css`);
  }
  const open = tokensCss.indexOf('{', start);
  const close = tokensCss.indexOf('\n}', open);
  return tokensCss.slice(open + 1, close);
}

const lightBlock = blockAfter(':root {');
const mediaDarkBlock = blockAfter(":root:where(:not([data-theme='light']))");
const toggleDarkBlock = blockAfter(":root[data-theme='dark']");

function hexTokens(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((match) => [
      match[1],
      match[2].toLowerCase(),
    ]),
  );
}

const light = hexTokens(lightBlock);
const dark = hexTokens(toggleDarkBlock);

function value(tokens: Map<string, string>, name: string): string {
  const hex = tokens.get(name);
  if (!hex) {
    throw new Error(`token --${name} not found`);
  }
  return hex;
}

const SURFACES = ['bg-canvas', 'bg-surface', 'bg-raised'];
const TEXT_TOKENS = [
  'text-primary',
  'text-secondary',
  'text-muted',
  'brand-primary',
  'brand-primary-text',
  'success',
  'warning',
  'danger',
  'info',
  'estimate',
  'provider-aws-ink',
  'provider-azure-ink',
  'provider-gcp-ink',
];
const AA_NORMAL = 4.5;

describe('Aurora token contrast (WCAG 2.2 AA)', () => {
  const cases = (['light', 'dark'] as const).flatMap((theme) =>
    TEXT_TOKENS.map((token) => ({ theme, token })),
  );

  it.each(cases)('$theme --$token clears 4.5:1 on every surface', ({ theme, token }) => {
    const tokens = theme === 'light' ? light : dark;
    for (const surface of SURFACES) {
      expect(contrastRatio(value(tokens, token), value(tokens, surface))).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it.each(['light', 'dark'] as const)('%s --on-brand clears 4.5:1 on the brand fill', (theme) => {
    const tokens = theme === 'light' ? light : dark;
    expect(
      contrastRatio(value(tokens, 'on-brand'), value(tokens, 'brand-primary')),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('declares identical dark values for the OS preference and the toggle', () => {
    expect(hexTokens(mediaDarkBlock)).toEqual(dark);
    expect(dark.size).toBeGreaterThan(40);
  });
});
