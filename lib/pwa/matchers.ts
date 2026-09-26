/** Navigations to the stall display. Lives outside app/sw.ts so it can be unit-tested. */
export function isDisplayNavigation({ request, url }: { request: Pick<Request, "mode">; url: URL }): boolean {
  return request.mode === "navigate" && (url.pathname === "/display" || url.pathname.startsWith("/display/"));
}

/** Public bill PDFs (/bill/<orderId>/<sig>) carry customer PII and must never be cached on the device. */
export function isBillRequest({ url }: { url: URL }): boolean {
  return url.pathname.startsWith("/bill/");
}
