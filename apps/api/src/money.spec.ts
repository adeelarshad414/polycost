import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import cases from '@polycost/types/money-cases.json' with { type: 'json' };
import {
  addUsd,
  fromMicros,
  percentChange,
  roundPercent,
  roundRateUsd,
  roundUsd,
  sumUsd,
  toMicros,
} from './money.js';

// Audit M-04: one money contract, shared with the web app.

describe('money (shared cases)', () => {
  it.each(cases.roundUsd)('roundUsd($input) = $expected', ({ input, expected }) => {
    expect(Object.is(roundUsd(input), expected)).toBe(true);
  });

  it.each(cases.roundRateUsd)('roundRateUsd($input) = $expected', ({ input, expected }) => {
    expect(roundRateUsd(input)).toBe(expected);
  });

  it.each(cases.addUsd)('addUsd($input) = $expected', ({ input, expected }) => {
    expect(addUsd(input[0] as number, input[1] as number)).toBe(expected);
  });

  it.each(cases.sumUsd)('sumUsd($input) = $expected', ({ input, expected }) => {
    expect(sumUsd(input)).toBe(expected);
  });

  it.each(cases.percentChange)('percentChange($input) = $expected', ({ input, expected }) => {
    expect(percentChange(input[0] as number, input[1] as number)).toBe(expected);
  });
});

describe('money (API)', () => {
  it('is the same file as the web copy', () => {
    // Jest runs with apps/api as its root directory.
    const api = readFileSync(path.resolve('src/money.ts'), 'utf8');
    const web = readFileSync(path.resolve('../web/src/lib/money.ts'), 'utf8');
    expect(web).toBe(api);
  });

  it('is the only cent-rounding helper in either app', () => {
    const roots = [path.resolve('src'), path.resolve('../web/src')];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.spec\.tsx?$/.test(entry.name) &&
          entry.name !== 'money.ts'
        ) {
          const text = readFileSync(full, 'utf8');
          if (/Math\.round\([^;]*\* 100\) \/ 100\b/.test(text)) offenders.push(full);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });

  it('round-trips micro-dollars and refuses amounts it cannot hold exactly', () => {
    expect(toMicros(12.345678)).toBe(12_345_678);
    expect(fromMicros(toMicros(-3.5))).toBe(-3.5);
    expect(() => toMicros(Number.NaN)).toThrow(RangeError);
    expect(() => toMicros(Infinity)).toThrow(RangeError);
    expect(() => toMicros(1e10)).toThrow(RangeError);
  });

  it('sums independently of order', () => {
    const parts = [0.1, 0.7, 1e-6, 1234.56, 0.2];
    expect(sumUsd(parts)).toBe(sumUsd([...parts].reverse()));
  });

  it('validates the decimals argument', () => {
    expect(roundUsd(1.23456, 0)).toBe(1);
    expect(roundPercent(12.345678)).toBe(12.3457);
    expect(() => roundUsd(1, 7)).toThrow(RangeError);
    expect(() => roundUsd(1, 1.5)).toThrow(RangeError);
  });
});
