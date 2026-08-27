import { memoryGbFromTokens, tokenizeSizingQuery } from './comparison-models';

// H-F1 slice 2: the natural-language sizing parser used to be buried in the
// 17k-line App.tsx and could only be exercised by typing into a rendered form.
// As a standalone pure module its edge cases are directly testable.

describe('comparison-models (extracted from App.tsx)', () => {
  describe('tokenizeSizingQuery', () => {
    it('splits a sizing phrase into number and word tokens', () => {
      expect(tokenizeSizingQuery('4 vcpu 16gb')).toEqual(['4', 'vcpu', '16', 'gb']);
    });

    it('separates digits from adjacent letters', () => {
      expect(tokenizeSizingQuery('16gb')).toEqual(['16', 'gb']);
    });

    it('returns nothing for input with no alphanumerics', () => {
      expect(tokenizeSizingQuery('   ---  ')).toEqual([]);
    });
  });

  describe('memoryGbFromTokens', () => {
    it('reads a memory size stated with a unit', () => {
      expect(memoryGbFromTokens(tokenizeSizingQuery('16gb ram'))).toBe(16);
    });

    it('ignores a bare number with no memory unit or keyword', () => {
      expect(memoryGbFromTokens(tokenizeSizingQuery('4 vcpu'))).toBeUndefined();
    });
  });
});
