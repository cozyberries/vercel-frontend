import { describe, it, expect } from "vitest";
import { parseDelhiveryWebhookPayload } from "./delhivery-webhook";

const scan = {
  AWB: "AWB123",
  Status: "In Transit",
  StatusDateTime: "2026-09-28T10:00:00+05:30",
  StatusType: "UD",
  StatusLocation: "Bangalore_Hub",
  Instructions: "Bag added",
};

describe("parseDelhiveryWebhookPayload", () => {
  it("parses a flat single-scan payload", () => {
    const p = parseDelhiveryWebhookPayload(scan);
    expect(p).not.toBeNull();
    expect(p!.raw_awb).toBe("AWB123");
    expect(p!.scans).toEqual([
      {
        awb: "AWB123",
        status: "In Transit",
        status_datetime: "2026-09-28T10:00:00+05:30",
        status_type: "UD",
        status_location: "Bangalore_Hub",
        instructions: "Bag added",
      },
    ]);
  });

  it("parses { scans: [...] } and skips invalid entries", () => {
    const p = parseDelhiveryWebhookPayload({
      scans: [scan, { AWB: "", Status: "x", StatusDateTime: "y" }, { AWB: "B2" }],
    });
    expect(p!.scans).toHaveLength(1);
  });

  it("returns null for a payload with no valid scan", () => {
    expect(parseDelhiveryWebhookPayload({ hello: "world" })).toBeNull();
    expect(parseDelhiveryWebhookPayload(null)).toBeNull();
    expect(parseDelhiveryWebhookPayload({ scans: [] })).toBeNull();
  });
});
