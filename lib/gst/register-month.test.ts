import { describe, expect, it } from "vitest";
import {
  availableMonths,
  currentIstMonth,
  defaultRegisterMonth,
  isUnfinishedMonth,
  monthBounds,
  monthKey,
  monthLabel,
  parseRegisterMonth,
  registerPeriod,
} from "./register-month";

const OCT_3 = new Date("2026-10-03T04:30:00.000Z"); // 10:00 IST

describe("register-month", () => {
  it("rolls month keys over year ends", () => {
    expect(monthKey(2026, 8)).toBe("2026-09");
    expect(monthKey(2026, 12)).toBe("2027-01");
    expect(monthKey(2027, -1)).toBe("2026-12");
  });

  it("decides the month by IST: 30 Sep 23:59 is September, 1 Oct 00:01 is October", () => {
    expect(currentIstMonth(new Date("2026-09-30T18:29:00.000Z"))).toBe("2026-09");
    expect(currentIstMonth(new Date("2026-09-30T18:31:00.000Z"))).toBe("2026-10");
  });

  it("gives [start, end) of a month as IST midnights", () => {
    const { start, end } = monthBounds("2026-09");
    expect(start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(monthBounds("2026-12").end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("lists months from the current one back to GST registration, newest first", () => {
    expect(availableMonths(OCT_3)).toEqual(["2026-10", "2026-09"]);
    expect(availableMonths(new Date("2026-09-15T06:00:00.000Z"))).toEqual(["2026-09"]);
    expect(availableMonths(new Date("2026-12-31T19:00:00.000Z"))).toEqual([
      "2027-01", "2026-12", "2026-11", "2026-10", "2026-09",
    ]);
  });

  it("defaults to the last completed month, or the registration month itself", () => {
    expect(defaultRegisterMonth(OCT_3)).toBe("2026-09");
    expect(defaultRegisterMonth(new Date("2026-09-15T06:00:00.000Z"))).toBe("2026-09");
    expect(defaultRegisterMonth(new Date("2026-12-31T19:00:00.000Z"))).toBe("2026-12"); // 1 Jan 00:30 IST
  });

  it("accepts only months that have a register", () => {
    expect(parseRegisterMonth("2026-09", OCT_3)).toBe("2026-09");
    expect(parseRegisterMonth("2026-10", OCT_3)).toBe("2026-10");
    for (const bad of ["2026-08", "2026-11", "2026-13", "2026-9", "abcd-ef", "", null, undefined]) {
      expect(parseRegisterMonth(bad, OCT_3)).toBeNull();
    }
  });

  it("knows the current month is unfinished", () => {
    expect(isUnfinishedMonth("2026-10", OCT_3)).toBe(true);
    expect(isUnfinishedMonth("2026-09", OCT_3)).toBe(false);
  });

  it("labels months and their period", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(registerPeriod("2026-09", OCT_3)).toEqual({ from: "01-09-2026", to: "30-09-2026", unfinished: false });
    expect(registerPeriod("2026-10", OCT_3)).toEqual({ from: "01-10-2026", to: "03-10-2026", unfinished: true });
  });
});
