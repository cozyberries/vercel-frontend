import { describe, expect, it } from "vitest";
import {
  emptyTitle,
  formatCount,
  formatItemsPerOrder,
  formatRupees,
  formatRupeesCompact,
  kpiHint,
  monthYear,
} from "./sales-format";

describe("formatRupees", () => {
  it("rounds to whole rupees with Indian digit grouping", () => {
    expect(formatRupees(24310)).toBe("₹24,310");
    expect(formatRupees(123456.7)).toBe("₹1,23,457");
    expect(formatRupees(0)).toBe("₹0");
  });
  it("shows a dash when there is no value", () => {
    expect(formatRupees(null)).toBe("—");
  });
});

describe("formatRupeesCompact", () => {
  it.each([
    [0, "₹0"],
    [950, "₹950"],
    [1500, "₹1.5k"],
    [12000, "₹12k"],
    [120000, "₹1.2L"],
    [1250000, "₹13L"],
  ])("%d → %s", (n, s) => {
    expect(formatRupeesCompact(n)).toBe(s);
  });
});

describe("formatCount and formatItemsPerOrder", () => {
  it("groups counts and shows one decimal for items per order", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(null)).toBe("—");
    expect(formatItemsPerOrder(2.345)).toBe("2.3");
    expect(formatItemsPerOrder(2)).toBe("2.0");
    expect(formatItemsPerOrder(null)).toBe("—");
  });
});

describe("kpiHint", () => {
  const m30 = { range: "30d" as const, previous: { from: "a", to: "b" }, first_sale_at: null };

  it.each([
    [{ value: 24310, previous: 20600 }, "↑ 18% vs previous 30 days"],
    [{ value: 1736, previous: 1872 }, "↓ 7% vs previous 30 days"],
    [{ value: 100, previous: 100 }, "No change vs previous 30 days"],
    [{ value: 100.4, previous: 100 }, "No change vs previous 30 days"],
    [{ value: 0, previous: 500 }, "↓ 100% vs previous 30 days"],
    [{ value: 5, previous: 0 }, "None in previous 30 days"],
    [{ value: 1500, previous: null }, "None in previous 30 days"],
    [{ value: 0, previous: 0 }, "vs previous 30 days"],
    [{ value: null, previous: 1500 }, "vs previous 30 days"],
  ])("%o → %s", (kpi, hint) => {
    expect(kpiHint(m30, kpi)).toBe(hint);
  });

  it("names the 13-week comparison for 3 months", () => {
    expect(kpiHint({ ...m30, range: "3m" }, { value: 2, previous: 1 })).toBe("↑ 100% vs previous 13 weeks");
  });

  it("says since when for All time, and nothing before the first sale", () => {
    expect(
      kpiHint({ range: "all", previous: null, first_sale_at: "2026-02-28T14:15:41Z" }, { value: 5, previous: null }),
    ).toBe("since Feb 2026");
    expect(kpiHint({ range: "all", previous: null, first_sale_at: null }, { value: 0, previous: null })).toBeUndefined();
  });
});

describe("monthYear", () => {
  it("uses the IST month", () => {
    expect(monthYear("2026-02-28T14:15:41Z")).toBe("Feb 2026");
    expect(monthYear("2026-02-28T18:45:00Z")).toBe("Mar 2026");
  });
});

describe("emptyTitle", () => {
  it("follows the chip", () => {
    expect(emptyTitle("30d")).toBe("No paid orders in the last 30 days");
    expect(emptyTitle("3m")).toBe("No paid orders in the last 3 months");
    expect(emptyTitle("all")).toBe("No paid orders yet");
  });
});
