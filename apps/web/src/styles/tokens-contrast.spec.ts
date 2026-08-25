import { readFileSync } from 'node:fs';
import path from 'node:path';

// UX-1 regression guard: muted body text and success text must clear WCAG AA
// (4.5:1) against every surface in both themes. These tokens previously shipped
// at ~3:1. Kept as a test (not just a CI script) so a token edit that regresses
// contrast fails the unit gate.

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

// tokens.css is ordered: the light block first, then the [data-theme='dark']
// block. Reading the first vs last occurrence of each token yields the two
// theme values without a full CSS parser.
const lightBlock = tokensCss.split("data-theme='dark'")[0];
const darkBlock = tokensCss.slice(tokensCss.indexOf("data-theme='dark'"));

function tokenValue(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) {
    throw new Error(`token --${name} not found`);
  }
  return match[1].toLowerCase();
}

// Read the surfaces from the same source of truth rather than hardcoding hex
// (which would also trip the theme-hex guard that forbids raw hex outside
// tokens.css).
const SURFACE_TOKENS = ['surface-canvas', 'surface-card', 'surface-raised'];
const LIGHT_SURFACES = SURFACE_TOKENS.map((token) => tokenValue(lightBlock, token));
const DARK_SURFACES = SURFACE_TOKENS.map((token) => tokenValue(darkBlock, token));
const AA_NORMAL = 4.5;

describe('token contrast (WCAG AA)', () => {
  const cases: Array<{ label: string; token: string; block: string; surfaces: string[] }> = [
    { label: 'light muted text', token: 'ink-400', block: lightBlock, surfaces: LIGHT_SURFACES },
    { label: 'light success text', token: 'status-ok', block: lightBlock, surfaces: LIGHT_SURFACES },
    { label: 'dark muted text', token: 'ink-400', block: darkBlock, surfaces: DARK_SURFACES },
    { label: 'dark success text', token: 'status-ok', block: darkBlock, surfaces: DARK_SURFACES },
  ];

  it.each(cases)('$label clears AA on every surface', ({ token, block, surfaces }) => {
    const color = tokenValue(block, token);
    for (const surface of surfaces) {
      expect(contrastRatio(color, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
