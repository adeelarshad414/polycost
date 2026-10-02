import {
  isWorkspaceSection,
  workspaceSectionFromHash,
  workspaceSectionHash,
} from './workspace-route';

describe('workspace routes', () => {
  it('round-trips every section through the hash', () => {
    for (const section of ['overview', 'account', 'team', 'reconciliation'] as const) {
      expect(workspaceSectionFromHash(workspaceSectionHash(section))).toBe(section);
    }
  });

  it('ignores unrelated or unknown hashes', () => {
    expect(workspaceSectionFromHash('')).toBeUndefined();
    expect(workspaceSectionFromHash('#requirements')).toBeUndefined();
    expect(workspaceSectionFromHash('#workspace/billing')).toBeUndefined();
    expect(isWorkspaceSection('team')).toBe(true);
    expect(isWorkspaceSection('admin')).toBe(false);
  });
});
