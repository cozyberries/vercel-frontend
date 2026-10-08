import { describe, expect, it } from "vitest";
import { addMonths, currentPeriod, formatDay, isIsoDate, isPeriod, istToday, recentPeriods } from "./dates";

describe("retail dates", () => {
  it("uses the IST calendar day", () => {
    expect(istToday(new Date("2026-10-31T18:29:00Z"))).toBe("2026-10-31");
    expect(istToday(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11-01");
    expect(currentPeriod(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11");
  });
  it("validates periods and dates", () => {
    expect(isPeriod("2026-09")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-1-05")).toBe(false);
  });
  it("lists recent periods newest first across a year end", () => {
    expect(recentPeriods(new Date("2026-02-10T05:00:00Z"), 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
  it("adds months, clamping to the month's last day", () => {
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("formats a day as dd-mm-yyyy", () => {
    expect(formatDay("2026-10-08")).toBe("08-10-2026");
  });
});
