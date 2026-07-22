/**
 * Returns true if `path` is a safe same-origin relative redirect target.
 * Rejects nulls, non-strings, paths that don't start with `/`, protocol-relative
 * paths (`//`), and any colon in the path segment (before `?` or `#`) to
 * block things like `/evil:payload` while allowing query values like `?t=10:30`.
 * Note: `javascript:` / `data:` are already caught by the startsWith("/") check.
 */
export function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const pathSegment = path.split(/[?#]/)[0];
  if (pathSegment.includes(":")) return false;
  return true;
}
