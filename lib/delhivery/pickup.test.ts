import { describe, expect, it } from "vitest";
import { appendPickupNote, interpretPickupResponse, istToday, planPickup, pickupNoteLine } from "./pickup";

describe("istToday", () => {
  it("gives the IST calendar date, which is already tomorrow after 18:30 UTC", () => {
    expect(istToday(new Date("2026-11-06T06:30:00Z"))).toBe("2026-11-06");
    expect(istToday(new Date("2026-11-06T18:29:59Z"))).toBe("2026-11-06");
    expect(istToday(new Date("2026-11-06T18:30:00Z"))).toBe("2026-11-07");
  });
});

describe("planPickup", () => {
  const now = new Date("2026-11-06T06:30:00Z");

  it("defaults to a same-day pickup of one parcel at 14:00", () => {
    expect(planPickup({ warehouseName: "Cozyberries", now })).toEqual({
      pickup_time: "14:00:00",
      pickup_date: "2026-11-06",
      pickup_location: "Cozyberries",
      expected_package_count: 1,
    });
  });

  it("takes a later date and a parcel count", () => {
    expect(planPickup({ warehouseName: "Cozyberries", now, date: "2026-11-08", count: 3 })).toMatchObject({
      pickup_date: "2026-11-08",
      expected_package_count: 3,
    });
  });

  it("refuses a past date, a malformed date, a non-positive count and a blank warehouse", () => {
    expect(() => planPickup({ warehouseName: "Cozyberries", now, date: "2026-11-05" })).toThrow(/past/);
    expect(() => planPickup({ warehouseName: "Cozyberries", now, date: "6/11/2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => planPickup({ warehouseName: "Cozyberries", now, count: 0 })).toThrow(/at least 1/);
    expect(() => planPickup({ warehouseName: "Cozyberries", now, count: 1.5 })).toThrow(/at least 1/);
    expect(() => planPickup({ warehouseName: " ", now })).toThrow(/warehouse/);
  });
});

describe("interpretPickupResponse", () => {
  it("reads the pickup id, slot and date from a success body", () => {
    expect(
      interpretPickupResponse(200, {
        pickup_id: 118775,
        pickup_time: "14:00:00",
        pickup_date: "2026-11-06",
        pickup_location_name: "Cozyberries",
        expected_package_count: 1,
        incoming_center_name: "Bangalore_Dasarahalli_C",
      })
    ).toEqual({ ok: true, pickupId: 118775, time: "14:00:00", date: "2026-11-06", location: "Cozyberries" });
  });

  it("treats a 'request already exists' refusal as an open pickup", () => {
    const r = interpretPickupResponse(400, { pr_exist: "A pickup request already exists for this date" });
    expect(r).toEqual({ ok: false, alreadyOpen: true, message: "A pickup request already exists for this date" });
    expect(interpretPickupResponse(400, "Pickup request already exist for the location")).toMatchObject({ alreadyOpen: true });
  });

  it("surfaces any other refusal with Delhivery's message", () => {
    expect(
      interpretPickupResponse(400, { pickup_location: "Invalid Pickup Location ClientWarehouse matching query does not exist." })
    ).toEqual({
      ok: false,
      alreadyOpen: false,
      message: "Invalid Pickup Location ClientWarehouse matching query does not exist.",
    });
    expect(interpretPickupResponse(500, "")).toEqual({ ok: false, alreadyOpen: false, message: "HTTP 500" });
    expect(interpretPickupResponse(200, { pickup_time: "14:00:00" })).toEqual({
      ok: false,
      alreadyOpen: false,
      message: "Delhivery returned no pickup id",
    });
  });
});

describe("pickup notes", () => {
  it("writes one note line with the id, date and slot, and appends it to existing notes", () => {
    const line = pickupNoteLine({ pickupId: 118775, date: "2026-11-06", time: "14:00:00" });
    expect(line).toBe("Pickup #118775 requested for 2026-11-06 14:00");
    expect(appendPickupNote(null, line)).toBe(line);
    expect(appendPickupNote("Shipment 1 cancelled: x", line)).toBe(`Shipment 1 cancelled: x\n${line}`);
  });
});
