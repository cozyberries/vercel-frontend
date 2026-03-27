import "server-only";

import type { OrderShipmentTrackingData, ShipmentTrackingScan } from "@/lib/types/delhivery-tracking";

function getTrackingBaseUrl(): string {
  return (
    process.env.DELHIVERY_TRACKING_BASE_URL ||
    process.env.DELHIVERY_BASE_URL ||
    "https://track.delhivery.com"
  );
}

/** Delhivery `packages/json` scan row — `Scans` is an array of `{ ScanDetail: {...} }`. */
interface DelhiveryScanRow {
  ScanDetail?: {
    Scan?: string;
    ScanDateTime?: string;
    StatusDateTime?: string;
    ScannedLocation?: string;
    Instructions?: string;
    ScanType?: string;
    StatusCode?: string;
  };
}

interface DelhiveryShipmentPayload {
  AWB?: string;
  Status?: {
    Status?: string;
    StatusLocation?: string;
    StatusDateTime?: string;
    Instructions?: string;
  };
  Scans?: DelhiveryScanRow[];
}

interface DelhiveryPackagesResponse {
  ShipmentData?: Array<{ Shipment?: DelhiveryShipmentPayload }>;
}

function parseScanRow(row: DelhiveryScanRow): ShipmentTrackingScan | null {
  const d = row.ScanDetail;
  if (!d) return null;
  const status = typeof d.Scan === "string" && d.Scan.trim() ? d.Scan.trim() : "Update";
  const timestamp =
    (typeof d.ScanDateTime === "string" && d.ScanDateTime) ||
    (typeof d.StatusDateTime === "string" && d.StatusDateTime) ||
    undefined;
  const location =
    typeof d.ScannedLocation === "string" && d.ScannedLocation.trim()
      ? d.ScannedLocation.trim()
      : undefined;
  const remarks =
    typeof d.Instructions === "string" && d.Instructions.trim()
      ? d.Instructions.trim()
      : undefined;
  return { status, location, timestamp, remarks };
}

function parseTime(s: string | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Fetches package tracking from Delhivery Pull API (`/api/v1/packages/json/`).
 * @see https://delhivery-express-api-doc.readme.io/reference/order-tracking-api
 */
export async function fetchPackageTrackingByWaybill(
  waybill: string
): Promise<OrderShipmentTrackingData> {
  const apiKey = process.env.DELIVERY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "DELIVERY_API_KEY is not set. Add it to .env.local to enable shipment tracking."
    );
  }

  const trimmedWaybill = waybill.trim();
  if (!trimmedWaybill) {
    throw new Error("Waybill is empty");
  }

  const base = getTrackingBaseUrl().replace(/\/$/, "");
  const url = new URL(`${base}/api/v1/packages/json/`);
  url.searchParams.set("waybill", trimmedWaybill);
  url.searchParams.set("token", apiKey.trim());
  url.searchParams.set("verbose", "2");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Delhivery tracking request failed: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const bodyText = await res.text();
  let raw: unknown;
  try {
    raw = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new Error(
      `Delhivery tracking invalid JSON (${res.status}): ${bodyText.slice(0, 200) || res.statusText}`
    );
  }

  if (!res.ok) {
    const snippet =
      typeof raw === "object" && raw !== null
        ? JSON.stringify(raw).slice(0, 300)
        : String(raw).slice(0, 200);
    throw new Error(
      `Delhivery tracking API failed: ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`
    );
  }

  const data = raw as DelhiveryPackagesResponse;
  const shipmentData = Array.isArray(data.ShipmentData) ? data.ShipmentData : [];
  const first = shipmentData[0]?.Shipment;
  if (!first) {
    throw new Error("No shipment data returned for this waybill");
  }

  const scansRaw = Array.isArray(first.Scans) ? first.Scans : [];
  const scans: ShipmentTrackingScan[] = [];
  for (const row of scansRaw) {
    const parsed = parseScanRow(row);
    if (parsed) scans.push(parsed);
  }

  scans.sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));

  const st = first.Status;
  const currentStatus =
    typeof st?.Status === "string" && st.Status.trim() ? st.Status.trim() : undefined;

  const awb =
    typeof first.AWB === "string" && first.AWB.trim() ? first.AWB.trim() : trimmedWaybill;

  return {
    waybill: awb,
    currentStatus,
    scans,
  };
}
