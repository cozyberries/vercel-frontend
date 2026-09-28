// Delhivery shipment-scan webhook payloads arrive either as { scans: [...] }
// or as a single flat scan object with PascalCase keys.

export interface ParsedDelhiveryScan {
  awb: string;
  status: string;
  status_type?: string;
  status_datetime: string;
  status_location?: string;
  instructions?: string;
}

export interface ParsedDelhiveryPayload {
  raw_awb: string | null;
  scans: ParsedDelhiveryScan[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseScan(raw: unknown): ParsedDelhiveryScan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const awb = str(r.AWB);
  const status = str(r.Status);
  const statusDateTime = str(r.StatusDateTime);
  if (!awb || !status || !statusDateTime) return null;
  return {
    awb,
    status,
    status_datetime: statusDateTime,
    status_type: str(r.StatusType),
    status_location: str(r.StatusLocation),
    instructions: str(r.Instructions),
  };
}

export function parseDelhiveryWebhookPayload(body: unknown): ParsedDelhiveryPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const rawScans = Array.isArray(b.scans) ? b.scans : [b];
  const scans = rawScans
    .map(parseScan)
    .filter((s): s is ParsedDelhiveryScan => s !== null);
  if (scans.length === 0) return null;
  return { raw_awb: scans[0].awb, scans };
}
