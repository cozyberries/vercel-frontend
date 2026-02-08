/**
 * Shared slugify utility for scripts.
 * Converts a name to a URL-safe slug (lowercase, spaces to hyphens, non-alphanumeric removed).
 *
 * @param {string} name - Input name to slugify
 * @returns {string} Slug string
 */
export function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
