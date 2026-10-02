import { describe, expect, it } from "vitest";
import { parseSalesRange, SALES_RANGE_COPY, salesPeriods, salesWindowStart } from "./sales-range";

const iso = (d: Date) => d.toISOString();
const NOW = new Date("2026-10-02T04:30:00Z"); // Fri 2 Oct 2026, 10:00 IST

function contiguous(buckets: { start: Date; end: Date }[]) {
  return buckets.slice(1).every((b, i) => b.start.getTime() === buckets[i].end.getTime());
}

describe("parseSalesRange", () => {
  it("accepts the four chips", () => {
    expect(["30d", "3m", "12m", "all"].map(parseSalesRange)).toEqual(["30d", "3m", "12m", "all"]);
  });
  it.each([null, undefined, "", "7d", "ALL", "3M", " 30d"])("rejects %s", (value) => {
    expect(parseSalesRange(value)).toBeNull();
  });
});

describe("salesPeriods('30d')", () => {
  const p = salesPeriods("30d", NOW, null);

  it("is 30 daily buckets from 3 Sep to today, on IST midnights", () => {
    expect(p.bucket).toBe("day");
    expect(p.buckets).toHaveLength(30);
    expect(p.buckets[0]).toMatchObject({ key: "2026-09-03", label: "3 Sep" });
    expect(iso(p.buckets[0].start)).toBe("2026-09-02T18:30:00.000Z");
    expect(p.buckets[29]).toMatchObject({ key: "2026-10-02", label: "2 Oct" });
    expect(iso(p.current.from)).toBe("2026-09-02T18:30:00.000Z");
    expect(iso(p.current.to)).toBe("2026-10-02T18:30:00.000Z");
    expect(contiguous(p.buckets)).toBe(true);
  });

  it("compares with the 30 days just before", () => {
    expect(iso(p.previous!.from)).toBe("2026-08-03T18:30:00.000Z");
    expect(iso(p.previous!.to)).toBe("2026-09-02T18:30:00.000Z");
  });

  it("goes by the IST date around IST midnight, not the UTC date", () => {
    // 18:29Z is 23:59 IST on 1 Oct; 18:31Z is 00:01 IST on 2 Oct.
    expect(salesPeriods("30d", new Date("2026-10-01T18:29:00Z"), null).buckets[29].key).toBe("2026-10-01");
    expect(salesPeriods("30d", new Date("2026-10-01T18:31:00Z"), null).buckets[29].key).toBe("2026-10-02");
  });
});

describe("salesPeriods('3m')", () => {
  const p = salesPeriods("3m", NOW, null);

  it("is 13 Monday-start weeks ending with this week, across month ends", () => {
    expect(p.bucket).toBe("week");
    expect(p.buckets.map((b) => b.key)).toEqual([
      "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17",
      "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
    ]);
    expect(p.buckets[12].label).toBe("28 Sep");
    expect(iso(p.current.to)).toBe("2026-10-04T18:30:00.000Z");
    expect(contiguous(p.buckets)).toBe(true);
  });

  it("compares with the 13 weeks before", () => {
    expect(iso(p.previous!.from)).toBe("2026-04-05T18:30:00.000Z");
    expect(iso(p.previous!.to)).toBe(iso(p.current.from));
  });

  it("treats Sunday 23:59 IST as this week and Monday 00:01 IST as a new one", () => {
    expect(salesPeriods("3m", new Date("2026-10-04T18:29:00Z"), null).buckets[12].key).toBe("2026-09-28");
    expect(salesPeriods("3m", new Date("2026-10-04T18:31:00Z"), null).buckets[12].key).toBe("2026-10-05");
  });
});

describe("salesPeriods('12m')", () => {
  const p = salesPeriods("12m", NOW, null);

  it("is this month and the 11 before, across the year end", () => {
    expect(p.bucket).toBe("month");
    expect(p.buckets.map((b) => b.key)).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
    expect(p.buckets[0].label).toBe("Nov '25");
    expect(p.buckets[11].label).toBe("Oct '26");
    expect(iso(p.current.from)).toBe("2025-10-31T18:30:00.000Z");
    expect(iso(p.current.to)).toBe("2026-10-31T18:30:00.000Z");
    expect(contiguous(p.buckets)).toBe(true);
  });

  it("compares with the 12 months before", () => {
    expect(iso(p.previous!.from)).toBe("2024-10-31T18:30:00.000Z");
    expect(iso(p.previous!.to)).toBe(iso(p.current.from));
  });
});

describe("salesPeriods('all')", () => {
  it("starts in the IST month of the first sale and has no comparison", () => {
    const p = salesPeriods("all", NOW, new Date("2026-02-28T14:15:41Z"));
    expect(p.previous).toBeNull();
    expect(p.buckets.map((b) => b.key)).toEqual([
      "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("uses the IST month when the first sale is just after IST midnight on the 1st", () => {
    // 18:45Z on 28 Feb is 00:15 IST on 1 Mar.
    expect(salesPeriods("all", NOW, new Date("2026-02-28T18:45:00Z")).buckets[0].key).toBe("2026-03");
  });

  it("is just this month when nothing has sold", () => {
    expect(salesPeriods("all", NOW, null).buckets.map((b) => b.key)).toEqual(["2026-10"]);
  });
});

describe("salesWindowStart", () => {
  it("is the start of the previous period, or null (everything) for All time", () => {
    expect(iso(salesWindowStart("30d", NOW)!)).toBe("2026-08-03T18:30:00.000Z");
    expect(iso(salesWindowStart("12m", NOW)!)).toBe("2024-10-31T18:30:00.000Z");
    expect(salesWindowStart("all", NOW)).toBeNull();
  });
});

describe("SALES_RANGE_COPY", () => {
  it("names a comparison period for every range except All time", () => {
    expect(SALES_RANGE_COPY["30d"].previous).toBe("previous 30 days");
    expect(SALES_RANGE_COPY["3m"].previous).toBe("previous 13 weeks");
    expect(SALES_RANGE_COPY["12m"].previous).toBe("previous 12 months");
    expect(SALES_RANGE_COPY.all.previous).toBeNull();
  });
});
