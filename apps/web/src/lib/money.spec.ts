import cases from '../../../../packages/types/money-cases.json';
import { addUsd, percentChange, roundRateUsd, roundUsd, sumUsd } from './money';

// Audit M-04: the web app rounds exactly like the API (same shared cases).

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
