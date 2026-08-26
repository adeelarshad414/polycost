import { safePreviewColor, teamRoleLabel, svgDataUrl } from './workload-analysis';

// H-F1: these helpers used to live inside the 21k-line App.tsx and could only be
// exercised by rendering the whole application. Now that they are a standalone
// pure module they can be unit-tested directly — which is the point of the
// extraction, not just the smaller file.

describe('workload-analysis (extracted from App.tsx)', () => {
  describe('teamRoleLabel', () => {
    it('maps each role to its display label', () => {
      expect(teamRoleLabel('owner')).toBe('Owner');
      expect(teamRoleLabel('admin')).toBe('Admin');
      expect(teamRoleLabel('member')).toBe('Member');
    });
  });

  describe('safePreviewColor', () => {
    it('accepts a full 6-digit hex colour', () => {
      expect(safePreviewColor('#1A2B3C')).toBe('#1A2B3C');
    });

    it('rejects values that are not a 6-digit hex colour', () => {
      // Guards against style injection via untrusted preview values.
      expect(safePreviewColor('#abc')).toBeUndefined();
      expect(safePreviewColor('red')).toBeUndefined();
      expect(safePreviewColor('#12345g')).toBeUndefined();
      expect(safePreviewColor(undefined)).toBeUndefined();
    });
  });

  describe('svgDataUrl', () => {
    it('produces an inline svg data url', () => {
      expect(svgDataUrl('<svg/>')).toContain('data:image/svg+xml');
    });
  });
});
