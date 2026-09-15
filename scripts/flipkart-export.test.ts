import { describe, expect, it } from "vitest";
import { COLUMNS } from "../lib/flipkart/columns";
import { CONFIG } from "../lib/flipkart/config";
import {
  assertTemplateShape,
  buildReport,
  judgementCallFor,
  slugify,
  titleCase,
} from "./flipkart-export.mjs";

const HEADER = COLUMNS.map((c) => c.name);

describe("assertTemplateShape", () => {
  it("does not throw when the header row matches columns.ts", () => {
    expect(() => assertTemplateShape([HEADER])).not.toThrow();
  });

  it("aborts with the first mismatched index and both values when a column shifts", () => {
    // Simulates Flipkart reissuing the template with an extra column inserted
    // before "Seller SKU ID" (index 6) — every later cell would land one
    // column off and still pass QC with plausible-but-wrong data.
    const shifted = [...HEADER];
    shifted.splice(6, 0, "New Inserted Column");
    expect(() => assertTemplateShape([shifted])).toThrow(/column 6/);
    expect(() => assertTemplateShape([shifted])).toThrow(/"Seller SKU ID"/);
    expect(() => assertTemplateShape([shifted])).toThrow(/"New Inserted Column"/);
  });

  it("aborts when a column is renamed in place", () => {
    const renamed = [...HEADER];
    renamed[46] = "Primary Image URL"; // was "Main Image URL"
    expect(() => assertTemplateShape([renamed])).toThrow(/column 46/);
    expect(() => assertTemplateShape([renamed])).toThrow(/"Main Image URL"/);
    expect(() => assertTemplateShape([renamed])).toThrow(/"Primary Image URL"/);
  });

  it("aborts when the header row is missing entirely", () => {
    expect(() => assertTemplateShape([])).toThrow(/column 0/);
  });
});

describe("slugify", () => {
  it("matches the file's SKU casing to the catalog's slug casing", () => {
    expect(slugify("Coords Set Chinese Collar - Soft Pear")).toBe(
      "coords-set-chinese-collar-soft-pear",
    );
    expect(slugify("Jhabla & Shorts Half Sleeve - Rocket Rangers")).toBe(
      "jhabla-shorts-half-sleeve-rocket-rangers",
    );
  });
});

describe("titleCase", () => {
  it("upper-cases the first letter only", () => {
    expect(titleCase("cream")).toBe("Cream");
    expect(titleCase("")).toBe("");
  });
});

describe("judgementCallFor", () => {
  it("flags a nearest-match substitution", () => {
    expect(judgementCallFor({ base_colors: ["cream"] }, CONFIG)).toEqual({
      base: "cream",
      mapped: "Beige",
    });
    expect(judgementCallFor({ base_colors: ["lilac"] }, CONFIG)).toEqual({
      base: "lilac",
      mapped: "Purple",
    });
  });

  it("does not flag an exact match", () => {
    expect(judgementCallFor({ base_colors: ["beige"] }, CONFIG)).toBeNull();
    expect(judgementCallFor({ base_colors: ["white"] }, CONFIG)).toBeNull();
  });

  it("returns null when there is no base colour or no mapping", () => {
    expect(judgementCallFor({ base_colors: [] }, CONFIG)).toBeNull();
    expect(judgementCallFor({ base_colors: ["chartreuse"] }, CONFIG)).toBeNull();
  });
});

describe("buildReport", () => {
  const base = {
    generatedAt: "2026-09-15T00:00:00.000Z",
    base: "https://cozyberries.in",
    template: "template.xls",
    sheet: "kids_apparel_combo",
    rowCount: 6,
    config: CONFIG,
    blanks: new Map(),
    unmappedOptional: new Map(),
    judgementCalls: new Map(),
    skipped: [],
    orphans: [],
  };

  it("lists only the substitutions actually used in this run, with affected slugs", () => {
    const judgementCalls = new Map([
      ["cream → Beige", new Set(["jhabla-cream"])],
      ["lilac → Purple", new Set(["coords-set-lilac-blossom", "romper-lilac"])],
    ]);
    const report = buildReport({ ...base, judgementCalls });
    expect(report).toContain("## Judgement calls applied");
    expect(report).toContain("cream → Beige — jhabla-cream");
    expect(report).toContain(
      "lilac → Purple — coords-set-lilac-blossom, romper-lilac",
    );
  });

  it("says 'none' for judgement calls when the run used no substitutions", () => {
    const report = buildReport(base);
    const section = report.split("## Judgement calls applied")[1].split("## Unverified config")[0];
    expect(section).toContain("- none");
  });

  it("always reports package dimensions, weight and brand as unverified", () => {
    const report = buildReport(base);
    expect(report).toContain("## Unverified config");
    expect(report).toContain(`Length (CM): ${CONFIG.lengthCm}`);
    expect(report).toContain(`Breadth (CM): ${CONFIG.breadthCm}`);
    expect(report).toContain(`Height (CM): ${CONFIG.heightCm}`);
    expect(report).toContain(`Weight (KG): ${CONFIG.weightKg}`);
    expect(report).toContain(`Brand: ${CONFIG.brand}`);
  });

  it("lists optional dropdown columns left blank, separately from mandatory blanks", () => {
    const report = buildReport({
      ...base,
      blanks: new Map([["Manufacturer Details", 6]]),
      unmappedOptional: new Map([["Pattern/Print Type", 6], ["Sleeve Length", 2]]),
    });
    const mandatorySection = report.split("## Must be fixed before upload")[1].split("## Optional")[0];
    expect(mandatorySection).toContain("mandatory column `Manufacturer Details` is blank on 6 row(s)");
    expect(mandatorySection).not.toContain("Pattern/Print Type");

    const optionalSection = report
      .split("## Optional dropdown columns left blank")[1]
      .split("## Judgement calls applied")[0];
    expect(optionalSection).toContain("`Pattern/Print Type` is blank on 6 row(s)");
    expect(optionalSection).toContain("`Sleeve Length` is blank on 2 row(s)");
  });
});
