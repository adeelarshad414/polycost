/**
 * Workspace sections (UI-5) live in the URL hash, e.g. "#workspace/team", so a
 * section can be linked and Back works without clashing with the /compare/<id>
 * path the results use.
 */

export const WORKSPACE_SECTIONS = ['overview', 'account', 'team', 'reconciliation'] as const;

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

export function isWorkspaceSection(value: string): value is WorkspaceSection {
  return (WORKSPACE_SECTIONS as readonly string[]).includes(value);
}

export function workspaceSectionFromHash(hash: string): WorkspaceSection | undefined {
  const match = /^#workspace\/([a-z]+)$/.exec(hash);
  const candidate = match?.[1];
  return candidate && isWorkspaceSection(candidate) ? candidate : undefined;
}

export function workspaceSectionHash(section: WorkspaceSection): string {
  return `#workspace/${section}`;
}
