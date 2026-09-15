import { describe, expect, it } from "vitest";
import { columnIndex, COLUMN_COUNT, mandatoryColumns } from "./columns";
import { BRAND_SIZE, NUMBER_OF_APPAREL_COMBO, PATTERN_PRINT_TYPE, PRIMARY_COLOR } from "./enums";
import { CONFIG, PLACEHOLDER } from "./config";
import { groupId, mapProduct, MappingError, MAX_GROUP_ID_LENGTH, MULTI } from "./mapping";
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
    // Shortened: Flipkart rejects a Group ID of 32 characters or more, and the
    // full slug is 35. Every size of the product must still share it.
    const groupIds = new Set(rows.map((r) => cell(r, "Group ID")));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0].length).toBeLessThanOrEqual(MAX_GROUP_ID_LENGTH);
    expect([...groupIds][0]).toBe(groupId("coords-set-chinese-collar-soft-pear"));
    expect(rows.map((r) => cell(r, "Seller SKU ID"))).toEqual([
      "coords-set-chinese-collar-soft-pear-6-12m",
      "coords-set-chinese-collar-soft-pear-1-2y",
    ]);
  });

  it("uses our own catalog images, in order, on every row", () => {
    for (const row of mapped()) {
      expect(cell(row, "Main Image URL")).toBe(comboProduct.images[0]);
      expect(cell(row, "Other Image URL 1")).toBe(comboProduct.images[1]);
      expect(cell(row, "Other Image URL 2")).toBe(comboProduct.images[2]);
      expect(cell(row, "Other Image URL 3")).toBe(comboProduct.images[3]);
    }
  });

  it("never uses the template's flixcart URLs, which are Flipkart's re-processed copies", () => {
    const joined = mapped().flatMap((r) => r.cells).join(" ");
    expect(joined).not.toContain("flixcart");
  });

  it("takes at most four images, the maximum Flipkart accepts", () => {
    const many = { ...comboProduct, images: Array.from({ length: 8 }, (_, i) => `https://cdn.example/${i}.jpg`) };
    const result = mapProduct(many as typeof comboProduct, existingRow, filledConfig);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "Other Image URL 3")).toBe("https://cdn.example/3.jpg");
    expect(result.rows[0].cells.join(" ")).not.toContain("/4.jpg");
  });

  it("exports a product with no template row at all", () => {
    const result = mapProduct(comboProduct, null, filledConfig);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(result.rows).toHaveLength(2);
    expect(cell(result.rows[0], "Main Image URL")).toBe(comboProduct.images[0]);
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
    // Brand Color is the garment colour, not the print — matching the verified
    // listing's "Brand color = Beige". The print goes in Model Name.
    expect(cell(first, "Brand Color")).toBe("Beige");
    expect(cell(first, "Model Name")).toBe("Petal Pops");
  });

  it("says Baby Boys up to 24 months and Boys above it", () => {
    const rows = mapped(); // fixture sizes are 6-12m then 1-2y, both baby
    expect(cell(rows[0], "Ideal For")).toBe("Baby Boys");
    expect(cell(rows[1], "Ideal For")).toBe("Baby Boys");

    const older = {
      ...comboProduct,
      variants: [{ ...comboProduct.variants[0], size_slug: "5-6y", size: "5-6Y" }],
    };
    const result = mapProduct(older as typeof comboProduct, existingRow, filledConfig);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(cell(result.rows[0], "Ideal For")).toBe("Boys");
  });

  it("maps the category to product types and items included", () => {
    const [row] = mapped();
    expect(cell(row, "Primary Product Type")).toBe("Shirt");
    // Secondary is the OTHER garment, never a repeat of the primary — the
    // verified listing reads "Primary = Shirt, Secondary = Trouser".
    expect(cell(row, "Secondary Product Type")).toBe("Shorts");
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

  it("aborts rather than ship a flat 5% row above the GST slab boundary", () => {
    // The Rs 1784 newborn kits are the real case: relisting them under a flat
    // GST_5 would under-declare tax on every sale.
    const pricey = {
      ...comboProduct,
      variants: [{ ...comboProduct.variants[0], price: 1784 }],
    };
    expect(() => mapProduct(pricey as typeof comboProduct, existingRow, filledConfig)).toThrow(
      MappingError,
    );
    expect(() => mapProduct(pricey as typeof comboProduct, existingRow, filledConfig)).toThrow(
      /GST_APPAREL/,
    );
  });

  it("allows any price once the ceiling is disabled", () => {
    const slabAware = { ...filledConfig, taxCode: "GST_APPAREL", taxCodePriceCeiling: 0 };
    const pricey = {
      ...comboProduct,
      variants: [{ ...comboProduct.variants[0], price: 1784 }],
    };
    const result = mapProduct(pricey as typeof comboProduct, existingRow, slabAware);
    expect(result.status).toBe("mapped");
  });

  it("aborts on a Seller SKU ID over 64 characters", () => {
    const long = { ...comboProduct, slug: "x".repeat(65) };
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
    const unfilled = { ...CONFIG, manufacturerDetails: PLACEHOLDER, packerDetails: PLACEHOLDER };
    const result = mapProduct(comboProduct, existingRow, unfilled);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(result.rows[0].cells[columnIndex("Manufacturer Details")]).toBe("");
    expect(result.rows[0].blanks).toEqual(["Manufacturer Details", "Packer Details"]);
  });

  it("fills every mandatory column from the shipped config, with nothing blank", () => {
    const result = mapProduct(comboProduct, existingRow, CONFIG);
    if (result.status !== "mapped") throw new Error("expected mapped");
    expect(result.rows[0].blanks).toEqual([]);
  });

  it("uses the category's package size when it overrides the default", () => {
    // newborn-essentials is the category that carries an override, but it is
    // currently excluded, so relist it just for this assertion.
    const relisted = { ...CONFIG, excludedCategories: {} };
    const kit = { ...comboProduct, category_slug: "newborn-essentials" };
    const result = mapProduct(kit as typeof comboProduct, existingRow, relisted);
    if (result.status !== "mapped") throw new Error("expected mapped");
    const row = result.rows[0];
    expect(row.cells[columnIndex("Length (CM)")]).toBe("30");
    expect(row.cells[columnIndex("Breadth (CM)")]).toBe("20");
    expect(row.cells[columnIndex("Height (CM)")]).toBe("5");
    expect(row.cells[columnIndex("Weight (KG)")]).toBe("0.6");
  });

  it("skips an excluded category, saying why, without calling it a non-combo", () => {
    const kit = { ...comboProduct, category_slug: "newborn-essentials" };
    expect(mapProduct(kit as typeof comboProduct, existingRow, CONFIG)).toEqual({
      status: "skipped",
      reason: "category newborn-essentials is excluded — out of stock",
    });
  });

  it("falls back to the config package size for a category with no override", () => {
    const result = mapProduct(comboProduct, existingRow, CONFIG);
    if (result.status !== "mapped") throw new Error("expected mapped");
    const row = result.rows[0];
    expect(row.cells[columnIndex("Length (CM)")]).toBe(String(CONFIG.lengthCm));
    expect(row.cells[columnIndex("Weight (KG)")]).toBe(String(CONFIG.weightKg));
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
    it("takes the print's mapped motif — petal-pops is a floral", () => {
      const result = mapProduct(comboProduct, existingRow, filledConfig);
      if (result.status !== "mapped") throw new Error("expected mapped");
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe("Floral Print");
      expect(cell(result.rows[0], "Pattern")).toBe("Floral Print");
    });

    it("stays blank for a print with no mapped motif, rather than guessing", () => {
      const unmapped = {
        ...comboProduct,
        variants: comboProduct.variants.map((v) => ({ ...v, color_slug: "soft-pear" })),
      };
      const result = mapProduct(unmapped as typeof comboProduct, existingRow, filledConfig);
      if (result.status !== "mapped") throw new Error("expected mapped");
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe("");
      expect(result.rows[0].unmappedOptional).toContain("Pattern/Print Type");
      // Pattern still gets the generic fallback, which IS legal in column 38.
      expect(cell(result.rows[0], "Pattern")).toBe("Printed");
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

    it("falls back to the configured list only when the print is unmapped", () => {
      // The per-print motif wins; patternPrintType is the catch-all beneath it.
      const withPrintType = {
        ...filledConfig,
        printPatternMap: {},
        patternPrintType: ["Floral Print", "Solid"],
      };
      const result = mapProduct(comboProduct, existingRow, withPrintType);
      if (result.status !== "mapped") throw new Error("expected mapped");
      expect(cell(result.rows[0], "Pattern/Print Type")).toBe(`Floral Print${MULTI}Solid`);
      expect(result.rows[0].unmappedOptional).not.toContain("Pattern/Print Type");
    });

    it("only maps prints to motifs legal in BOTH Pattern and Pattern/Print Type", () => {
      // The same value feeds column 38 and column 53, whose vocabularies differ.
      for (const [print, motif] of Object.entries(CONFIG.printPatternMap)) {
        expect(PATTERN_PRINT_TYPE, `${print} -> ${motif}`).toContain(motif);
      }
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

describe("groupId", () => {
  it("leaves a slug that already fits alone", () => {
    expect(groupId("coords-set-lilac-blossom")).toBe("coords-set-lilac-blossom");
  });

  it("shortens every catalog slug to within Flipkart's limit", () => {
    const longest = "jhabla-shorts-half-sleeve-moons-and-stars"; // 41 chars
    expect(groupId(longest).length).toBeLessThanOrEqual(MAX_GROUP_ID_LENGTH);
  });

  it("is stable and collision-free across similar slugs", () => {
    const slugs = [
      "jhabla-shorts-half-sleeve-moons-and-stars",
      "jhabla-shorts-half-sleeve-mushie-mini",
      "jhabla-shorts-half-sleeve-joyful-orbs",
      "coords-set-chinese-collar-soft-pear",
      "coords-set-half-sleeve-petal-pops",
      "coords-set-layered-mushie-mini",
      "coords-set-layered-pine-cone",
    ];
    const ids = slugs.map(groupId);
    expect(new Set(ids).size).toBe(slugs.length);
    expect(ids).toEqual(slugs.map(groupId)); // deterministic
  });
});
