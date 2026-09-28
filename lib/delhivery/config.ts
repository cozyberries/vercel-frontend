// Lazy accessor — CLAUDE.md forbids env reads at module load (the admin app's
// version threw at import time and broke unrelated builds).

export interface DelhiveryConfig {
  baseUrl: string;
  token: string;
  warehouseName: string;
  timeoutMs: number;
}

export function getDelhiveryConfig(): DelhiveryConfig {
  const token = process.env.DELIVERY_API_KEY?.trim();
  if (!token) {
    throw new Error("Delhivery config missing required env: DELIVERY_API_KEY");
  }
  const baseUrl = (process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com")
    .trim()
    .replace(/\/$/, "");
  return {
    baseUrl,
    token,
    warehouseName: (process.env.DELHIVERY_WAREHOUSE_NAME || "").trim(),
    timeoutMs: 15_000,
  };
}
