// Judges a page's response time from consecutive requests. The first request can land on a
// cold function instance (Fluid compute makes that rarer, not impossible), so it is reported
// but not judged; the limit applies to the median of the requests after it.

/**
 * @param {{ status: number, ms: number }[]} samples consecutive requests, first one first
 * @param {number} limitMs
 * @returns {{ ok: boolean, firstMs: number | null, warmMs: number | null, detail: string }}
 */
export function pageLatency(samples, limitMs) {
  const firstMs = samples[0]?.ms ?? null;
  const warm = samples.slice(1).map((s) => s.ms);
  const sorted = [...warm].sort((a, b) => a - b);
  const warmMs = sorted.length > 0 ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
  const allOk = samples.length > 0 && samples.every((s) => s.status === 200);
  const detail =
    warmMs === null
      ? `no warm request; first ${firstMs}ms`
      : `warm median ${warmMs}ms (${warm.join("/")}); first ${firstMs}ms`;
  return { ok: allOk && warmMs !== null && warmMs < limitMs, firstMs, warmMs, detail };
}
