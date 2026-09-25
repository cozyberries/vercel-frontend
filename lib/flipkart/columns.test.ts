import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  COLUMN_COUNT,
  columnIndex,
  FIRST_SELLER_COLUMN,
  layoutForTemplate,
  mandatoryColumns,
  valuesByName,
} from "./columns";
import {
  BRAND_SIZE, CHARACTER, DETAIL_PLACEMENT, NUMBER_OF_APPAREL_COMBO, PATTERN_PRINT_TYPE,
  PRIMARY_COLOR, SECONDARY_COLOR, TAX_CODE,
} from "./enums";

describe("COLUMNS", () => {
  it("has exactly 69 columns in template order", () => {
    expect(COLUMNS).toHaveLength(COLUMN_COUNT);
    expect(COLUMNS.map((c) => c.index)).toEqual([...Array(69).keys()]);
  });

  it("marks the 24 seller-fillable mandatory columns", () => {
    // Product Data Status (4) and Disapproval Reason (5) are blue but Flipkart fills them.
    expect(mandatoryColumns().map((c) => c.name)).toEqual([
      "Seller SKU ID",
      "MRP (INR)",
      "Your selling price (INR)",
      "Fullfilment by",
      "HSN",
      "Country Of Origin",
      "Manufacturer Details",
      "Packer Details",
      "Tax Code",
      "Brand",
      "Label Size",
      "Ideal For",
      "Primary Product Type",
      "Secondary Product Type",
      "Fabric",
      "Pattern",
      "Occasion",
      "Fabric Care",
      "Items Included",
      "Style Code",
      "Brand Size",
      "Brand Color",
      "Primary Color",
      "Main Image URL",
    ]);
  });

  it("resolves a column name to its template index", () => {
    expect(columnIndex("Seller SKU ID")).toBe(6);
    expect(columnIndex("Main Image URL")).toBe(46);
    expect(columnIndex("EAN/UPC")).toBe(67);
  });

  it("throws on an unknown column name", () => {
    expect(() => columnIndex("Nope")).toThrow(/Nope/);
  });
});

describe("enums", () => {
  it("carries every size the catalog uses", () => {
    for (const size of ["0 - 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "2 - 3 Years", "3 - 4 Years", "4 - 5 Years", "5 - 6 Years"]) {
      expect(BRAND_SIZE).toContain(size);
    }
  });

  it("has 20 primary colours and no Cream, Lilac or Peach", () => {
    expect(PRIMARY_COLOR).toHaveLength(20);
    expect(PRIMARY_COLOR).not.toContain("Cream");
    expect(PRIMARY_COLOR).not.toContain("Lilac");
    expect(PRIMARY_COLOR).not.toContain("Peach");
  });

  it("offers the apparel tax code", () => {
    expect(TAX_CODE).toContain("GST_APPAREL");
  });

  it("has all 41 template Character values, including Flipkart's own spellings", () => {
    expect(CHARACTER).toHaveLength(41);
    expect(CHARACTER).toContain("Minnions");
    expect(CHARACTER).toContain("Looney Toons");
    expect(CHARACTER).toContain("NA");
    expect(CHARACTER).toContain("No Character");
  });

  it("has the 16 Pattern/Print Type values, distinct from Pattern's vocabulary", () => {
    expect(PATTERN_PRINT_TYPE).toHaveLength(16);
    // "Printed" is a legal Pattern value (column 38) but not a legal Pattern/Print
    // Type value (column 53) — the two dropdowns were conflated once already.
    expect(PATTERN_PRINT_TYPE).not.toContain("Printed");
    expect(PATTERN_PRINT_TYPE).toContain("Floral Print");
  });

  it("has the 10 Number of Apparel Combo values in the sheet's own order", () => {
    expect(NUMBER_OF_APPAREL_COMBO).toEqual(["1", "10", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("has the 8 Detail Placement values", () => {
    expect(DETAIL_PLACEMENT).toEqual([
      "All - Over", "Back", "Front Panel", "Hemline", "Neckline", "Sleeve", "Slits", "Yoke",
    ]);
  });

  it("shares its 20 values with Primary Color for Secondary Color", () => {
    expect(SECONDARY_COLOR).toEqual(PRIMARY_COLOR);
    expect(SECONDARY_COLOR).toHaveLength(20);
  });
});

describe("layoutForTemplate", () => {
  // The 15 Sep template: "Parent Variant FSN" inserted at 8, blank pushed to 9,
  // everything after shifted one right versus the 13 Sep download.
  const NEW_HEADER = [
    ...COLUMNS.slice(0, 8).map((c) => c.name),
    "Parent Variant FSN",
    "",
    ...COLUMNS.slice(9).map((c) => c.name),
  ];

  const cells = COLUMNS.map((c) => c.name || "");

  it("places every value under its own header, whatever the index", () => {
    const row = layoutForTemplate(cells, NEW_HEADER);
    expect(row).toHaveLength(NEW_HEADER.length);
    NEW_HEADER.forEach((name, i) => {
      if (name && name !== "Parent Variant FSN") expect(row[i]).toBe(name);
    });
  });

  it("leaves unknown and blank columns empty rather than guessing", () => {
    const row = layoutForTemplate(cells, NEW_HEADER);
    expect(row[NEW_HEADER.indexOf("Parent Variant FSN")]).toBe("");
    expect(row[9]).toBe("");
  });

  it("survives a reissue that moves Listing Status again", () => {
    const shifted = ["", ...NEW_HEADER];
    const row = layoutForTemplate(cells, shifted);
    expect(row[shifted.indexOf("Listing Status")]).toBe("Listing Status");
    expect(row[shifted.indexOf("MRP (INR)")]).toBe("MRP (INR)");
  });

  it("keys our values by name, skipping the unnamed column", () => {
    const byName = valuesByName(cells);
    expect(byName.get("Seller SKU ID")).toBe("Seller SKU ID");
    expect(byName.size).toBe(COLUMN_COUNT - 1); // the one blank has no name
  });
});

describe("paste fields for a target template", () => {
  // The 16 Sep template: 70 columns, "Parent Variant FSN" at 8, blank at 9,
  // Listing Status at 10. A TSV pasted at G5 must have a field per column
  // from 6 onward, including the two we leave empty — otherwise every later
  // value lands one column short.
  const SEP_16_HEADER = [
    ...COLUMNS.slice(0, 8).map((c) => c.name),
    "Parent Variant FSN",
    "",
    ...COLUMNS.slice(9).map((c) => c.name),
  ];

  it("emits one field per target column from Seller SKU ID onward", () => {
    const cells = COLUMNS.map((c) => c.name || "");
    const fields = layoutForTemplate(cells, SEP_16_HEADER).slice(FIRST_SELLER_COLUMN);
    expect(fields).toHaveLength(SEP_16_HEADER.length - FIRST_SELLER_COLUMN); // 64
    expect(fields[0]).toBe("Seller SKU ID");
    expect(fields[1]).toBe("Group ID");
    expect(fields[2]).toBe(""); // Parent Variant FSN — Flipkart's to fill
    expect(fields[3]).toBe(""); // the unnamed gap
    expect(fields[4]).toBe("Listing Status");
    expect(fields[5]).toBe("MRP (INR)");
  });

  it("differs from the 69-column layout by exactly one field", () => {
    const cells = COLUMNS.map((c) => c.name || "");
    const old = layoutForTemplate(cells, COLUMNS.map((c) => c.name)).slice(FIRST_SELLER_COLUMN);
    const fresh = layoutForTemplate(cells, SEP_16_HEADER).slice(FIRST_SELLER_COLUMN);
    expect(fresh.length - old.length).toBe(1);
    expect(old[3]).toBe("Listing Status"); // where it sat in the 69-column sheet
    expect(fresh[4]).toBe("Listing Status"); // where it sits now
  });
});
