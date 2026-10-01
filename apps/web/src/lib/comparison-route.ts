/**
 * URL-addressable results (UI-4). A comparison lives at /compare/<id>, so a
 * result can be bookmarked, shared with a teammate who can reach the API, and
 * left with the browser's Back button. Share links keep their own /share/<token>
 * path and are not handled here.
 */

const COMPARISON_PATH = /^\/compare\/([0-9A-Za-z-]{1,64})\/?$/;

export function comparisonIdFromPath(pathname: string): string | undefined {
  const match = COMPARISON_PATH.exec(pathname);
  return match?.[1];
}

export function comparisonPath(comparisonId: string): string {
  return `/compare/${encodeURIComponent(comparisonId)}`;
}
