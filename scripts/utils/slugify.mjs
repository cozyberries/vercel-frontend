/**
 * Shared slugify utility for scripts.
 * Converts a name to a URL-safe slug (lowercase, spaces to hyphens, non-alphanumeric removed).
 * Collapses consecutive hyphens and trims leading/trailing hyphens.
 *
 * @param {string} name - Input name to slugify (null/undefined coerced to empty string; non-strings via String(name))
 * @returns {string} Slug string
 */
export function slugify(name) {
  if (name == null) return "";
  const s = typeof name === "string" ? name : String(name);
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
