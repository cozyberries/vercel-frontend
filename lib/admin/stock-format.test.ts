import { describe, expect, it } from "vitest";
import { formatIstTime, formatShortDate, salesLine, stockText } from "./stock-format";

const NOW = new Date("2026-10-03T04:30:00Z");

describe("formatShortDate", () => {
  it("shows day and month in IST, adding the year only when it differs", () => {
    expect(formatShortDate("2026-09-28T05:00:00Z", NOW)).toBe("28 Sep");
    expect(formatShortDate("2026-09-30T18:45:00Z", NOW)).toBe("1 Oct");
    expect(formatShortDate("2025-12-28T05:00:00Z", NOW)).toBe("28 Dec 2025");
  });
});

describe("formatIstTime", () => {
  it("shows 24-hour IST time", () => {
    expect(formatIstTime("2026-10-03T04:30:00.000Z")).toBe("10:00");
    expect(formatIstTime("2026-10-02T18:35:00.000Z")).toBe("00:05");
  });
});

describe("salesLine", () => {
  it("says how many sold in 30 days and when it last sold", () => {
    expect(salesLine({ sold_30d: 3, last_sold_at: "2026-09-28T05:00:00Z" }, NOW)).toBe("sold 3 in 30 days · last sold 28 Sep");
  });
  it("says never sold when there is no sale", () => {
    expect(salesLine({ sold_30d: 0, last_sold_at: null }, NOW)).toBe("never sold");
  });
});

describe("stockText", () => {
  it("says 'left' for out and low sizes and 'on hand' for sizes in stock", () => {
    expect(stockText({ stock: 0, state: "out" })).toBe("0 left");
    expect(stockText({ stock: 2, state: "low" })).toBe("2 left");
    expect(stockText({ stock: 14, state: "in" })).toBe("14 on hand");
  });
});
