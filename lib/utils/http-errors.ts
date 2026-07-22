/**
 * Extract a human-readable error message from a failed `fetch` response.
 *
 * Tries to parse a JSON body of shape `{ error: string }` first; falls back
 * to `<fallback> (HTTP <status>)` when the body is empty, not JSON, or
 * doesn't contain a string `error` field.
 *
 * Shared by client-side service wrappers (cart, wishlist, ...) so that error
 * reporting stays consistent across features.
 */
export async function extractErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Body was empty or not JSON; fall through to default.
  }
  return `${fallback} (HTTP ${response.status})`;
}
