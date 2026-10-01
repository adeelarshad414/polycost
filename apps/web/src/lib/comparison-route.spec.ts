import { comparisonIdFromPath, comparisonPath } from './comparison-route';

describe('comparison routes', () => {
  it('round-trips a comparison id through its path', () => {
    const id = '77777777-7777-4777-8777-000000000001';

    expect(comparisonPath(id)).toBe(`/compare/${id}`);
    expect(comparisonIdFromPath(comparisonPath(id))).toBe(id);
    expect(comparisonIdFromPath(`/compare/${id}/`)).toBe(id);
  });

  it('ignores other paths and malformed ids', () => {
    expect(comparisonIdFromPath('/')).toBeUndefined();
    expect(comparisonIdFromPath('/share/abc')).toBeUndefined();
    expect(comparisonIdFromPath('/compare/')).toBeUndefined();
    expect(comparisonIdFromPath('/compare/a/b')).toBeUndefined();
    expect(comparisonIdFromPath('/compare/%3Cscript%3E')).toBeUndefined();
  });
});
