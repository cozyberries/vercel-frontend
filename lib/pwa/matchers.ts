/** Navigations to the stall display. Lives outside app/sw.ts so it can be unit-tested. */
export function isDisplayNavigation({ request, url }: { request: Pick<Request, "mode">; url: URL }): boolean {
  return request.mode === "navigate" && (url.pathname === "/display" || url.pathname.startsWith("/display/"));
}

/** Public bill PDFs (/bill/<orderId>/<sig>) carry customer PII and must never be cached on the device. */
export function isBillRequest({ url }: { url: URL }): boolean {
  return url.pathname.startsWith("/bill/");
}

/**
 * Admin APIs (/api/admin/*) must never be served from cache: a stale list read as a
 * normal 200 hides a failed refresh and can show pre-tick data after an action.
 * Same-origin only, any method.
 */
export function isAdminApiRequest({ url, sameOrigin }: { url: URL; sameOrigin: boolean }): boolean {
  return sameOrigin && url.pathname.startsWith("/api/admin/");
}
