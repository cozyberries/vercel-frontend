/**
 * Returns true if `path` is a safe same-origin relative redirect target.
 * Rejects nulls, non-strings, paths that don't start with `/`, protocol-relative
 * paths (`//`), and anything containing `:` (to block `javascript:` etc.).
 */
export function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes(":")) return false;
  return true;
}
