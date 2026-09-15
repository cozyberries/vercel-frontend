import { describe, expect, it } from "vitest";
import { columnIndex, COLUMN_COUNT, mandatoryColumns } from "./columns";
import { BRAND_SIZE, NUMBER_OF_APPAREL_COMBO, PATTERN_PRINT_TYPE, PRIMARY_COLOR } from "./enums";
import { CONFIG, PLACEHOLDER } from "./config";
import { mapProduct, MappingError, MULTI } from "./mapping";
import { comboProduct, existingRow, singleGarmentProduct } from "./__fixtures__/catalog-products";

const filledConfig = {
  ...CONFIG,
  manufacturerDetails: "CozyBerries, Bengaluru 560001",
  packerDetails: "CozyBerries, Bengaluru 560001",
};

function mapped() {
  const result = mapProduct(comboProduct, existingRow, filledConfig);
  if (result.status !== "mapped") throw new Error("expected mapped");
  return result.rows;
}
const cell = (row: { cells: string[] }, name: string) => row.cells[columnIndex(name)];

describe("mapProduct", () => {
  it("emits one row per size, each with 69 cells", () => {
    const rows = mapped();
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r.cells).toHaveLength(COLUMN_COUNT));
  });

  it("gives the variants one shared Group ID and distinct Seller SKU IDs", () => {
    const rows = mapped();
    expect(new Set(rows.map((r) => cell(r, "Group ID")))).toEqual(
      new Set(["coords-set-chinese-collar-soft-pear"]),
    );
    expect(rows.map((r) => cell(r, "Seller SKU ID"))).toEqual([
      "coords-set-chinese-collar-soft-pear-6-12m-petal-pops",
      "coords-set-chinese-collar-soft-pear-1-2y-petal-pops",
    ]);
  });

  it("carries the Flipkart-hosted images onto every row", () => {
    for (const row of mapped()) {
      expect(cell(row, "Main Image URL")).toBe(existingRow.images[0]);
      expect(cell(row, "Other Image URL 1")).toBe(existingRow.images[1]);
      expect(cell(row, "Other Image URL 2")).toBe(existingRow.images[2]);
      expect(cell(row, "Other Image URL 3")).toBe("");
    }
  });

  it("never uses the catalog's own image URLs", () => {
    const joined = mapped().flatMap((r) => r.cells).join(" ");
    expect(joined).not.toContain("cdn.example");
  });

  it("sets MRP to selling price plus the configured markup", () => {
    for (const row of mapped()) {
      expect(cell(row, "Your selling price (INR)")).toBe("839");
      expect(cell(row, "MRP (INR)")).toBe("1039");
    }
  });

  it("maps size, colour and gender into Flipkart's vocabulary", () => {
    const [first, second] = mapped();
    expect(cell(first, "Brand Size")).toBe("6 - 12 Months");
    expect(cell(second, "Brand Size")).toBe("1 - 2 Years");
    expect(cell(first, "Label Size")).toBe("6 - 12 Months");
    expect(cell(first, "Primary Color")).toBe("Beige");
    expect(cell(first, "Brand Color")).toBe("Petal Pops");
    expect(cell(first, "Ideal For")).toBe("Boys");
  });

  it("maps the category to product types and items included", () => {
    const [row] = mapped();
    expect(cell(row, "Primary Product Type")).toBe("Shirt");
    expect(cell(row, "Secondary Product Type")).toBe(`Shirt${MULTI}Shorts`);
    expect(cell(row, "Items Included")).toBe(`Shirt${MULTI}Shorts`);
    expect(cell(row, "Net Quantity")).toBe("2");
  });

  it("joins multi-valued config with the double colon", () => {
    const [row] = mapped();
    expect(cell(row, "Fabric Care")).toBe(
      `Gentle Machine Wash${MULTI}Do not bleach${MULTI}Dry in shade${MULTI}Wash with like colors`,
    );
    expect(cell(row, "Key Features")).toBe(`Lightweight muslin fabric${MULTI}Charming prints`);
  });

  it("derives sleeve length from the slug, falling back to NA", () => {
    const [row] = mapped();
    expect(cell(row, "Sleeve Length")).toBe("NA");
    const half = { ...comboProduct, slug: "jhabla-shorts-half-sleeve-joyful-orbs" };
    const result = mapProduct(half as typeof comboProduct, existingRow, filledConfig);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "Sleeve Length")).toBe("Half Sleeve");
  });

  it("fills every mandatory column for a fully configured product", () => {
    for (const row of mapped()) {
      for (const col of mandatoryColumns()) {
        expect(row.cells[col.index], `empty mandatory column ${col.name}`).not.toBe("");
      }
      expect(row.blanks).toEqual([]);
    }
  });

  it("reports an unmapped dropdown value as a blank instead of guessing", () => {
    const odd = { ...comboProduct, base_colors: ["chartreuse"] };
    const result = mapProduct(odd as typeof comboProduct, existingRow, filledConfig);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(result.rows[0].cells[columnIndex("Primary Color")]).toBe("");
    expect(result.rows[0].blanks).toContain("Primary Color");
  });

  it("emits only values that exist in the template's dropdowns", () => {
    for (const row of mapped()) {
      expect(BRAND_SIZE).toContain(cell(row, "Brand Size"));
      expect(PRIMARY_COLOR).toContain(cell(row, "Primary Color"));
    }
  });

  it("skips a product from a non-combo category", () => {
    const result = mapProduct(singleGarmentProduct, existingRow, filledConfig);
    expect(result).toEqual({ status: "skipped", reason: "category frocks is not a combo category" });
  });

  it("aborts on a Seller SKU ID over 64 characters", () => {
    const long = {
      ...comboProduct,
      variants: [{ ...comboProduct.variants[0], slug: "x".repeat(65) }],
    };
    expect(() => mapProduct(long as typeof comboProduct, existingRow, filledConfig)).toThrow(
      MappingError,
    );
    expect(() => mapProduct(long as typeof comboProduct, existingRow, filledConfig)).toThrow(/64/);
  });

  it("aborts on a tab or newline rather than escaping it", () => {
    for (const bad of ["has\ttab", "has\nnewline", "has\rreturn"]) {
      const product = { ...comboProduct, description: bad };
      expect(() => mapProduct(product as typeof comboProduct, existingRow, filledConfig)).toThrow(
        MappingError,
      );
    }
  });

  it("leaves mandatory config placeholders blank and reports them", () => {
    const result = mapProduct(comboProduct, existingRow, CONFIG);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(result.rows[0].cells[columnIndex("Manufacturer Details")]).toBe("");
    expect(result.rows[0].blanks).toEqual(["Manufacturer Details", "Packer Details"]);
  });

  it("scrubs a placeholder leaking from any field, not just the three call sites once wrapped by hand", () => {
    // Regression for the old real() helper, which only guarded manufacturerDetails,
    // packerDetails and brand. HSN never went through it, so a placeholder there
    // used to leak the literal "<<PLACEHOLDER>>" straight into the exported cell.
    const leaky = { ...filledConfig, hsn: PLACEHOLDER };
    const result = mapProduct(comboProduct, existingRow, leaky);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "HSN")).toBe("");
    expect(result.rows[0].blanks).toContain("HSN");
  });

  describe("Pattern/Print Type (column 53, separate from Pattern)", () => {
    it("is blank by default because CONFIG.patternPrintType is deliberately []", () => {
      const result = mapProduct(comboProduct, existingRow, filledConfig);
      if (result.status !== "mapped") throw new Error("expected mapped");
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe("");
      expect(result.rows[0].unmappedOptional).toContain("Pattern/Print Type");
    });

    it("never writes 'Printed' (a Pattern value) or any other value outside PATTERN_PRINT_TYPE", () => {
      // "Printed" is legal for column 38 (Pattern) but not for column 53. Before the
      // fix, mapping.ts set Pattern/Print Type from config.pattern.join(MULTI), which
      // put "Printed" here on every row — an illegal value that still passes QC.
      const misconfigured = { ...filledConfig, patternPrintType: ["Printed", "Floral Print"] };
      const result = mapProduct(comboProduct, existingRow, misconfigured);
      if (result.status !== "mapped") throw new Error("expected mapped");
      for (const row of result.rows) {
        const value = cell(row, "Pattern/Print Type");
        expect(value).not.toBe("Printed");
        for (const v of value.split(MULTI).filter(Boolean)) {
          expect(PATTERN_PRINT_TYPE).toContain(v);
        }
      }
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe("Floral Print");
    });

    it("passes through every legal value configured", () => {
      const withPrintType = { ...filledConfig, patternPrintType: ["Floral Print", "Solid"] };
      const result = mapProduct(comboProduct, existingRow, withPrintType);
      if (result.status !== "mapped") throw new Error("expected mapped");
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe(`Floral Print${MULTI}Solid`);
      expect(result.rows[0].unmappedOptional).not.toContain("Pattern/Print Type");
    });
  });

  it("routes Number of Apparel Combo through enum validation instead of trusting the config number", () => {
    const bad = { ...filledConfig, numberOfApparelCombo: 99 };
    const result = mapProduct(comboProduct, existingRow, bad);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "Number of Apparel Combo")).toBe("");
    expect(result.rows[0].unmappedOptional).toContain("Number of Apparel Combo");
    expect(NUMBER_OF_APPAREL_COMBO).toContain(String(filledConfig.numberOfApparelCombo));
  });

  it("reports a blanked optional dropdown column via unmappedOptional instead of blanking silently", () => {
    const badSleeve = { ...filledConfig, defaultSleeveLength: "Not A Real Sleeve Length" };
    const result = mapProduct(comboProduct, existingRow, badSleeve);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "Sleeve Length")).toBe("");
    expect(result.rows[0].unmappedOptional).toContain("Sleeve Length");
    // unmappedOptional never duplicates what `blanks` already reports.
    expect(result.rows[0].blanks).not.toContain("Sleeve Length");
  });
});
