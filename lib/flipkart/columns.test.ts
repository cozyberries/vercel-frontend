import { describe, expect, it } from "vitest";
import { COLUMNS, COLUMN_COUNT, columnIndex, mandatoryColumns } from "./columns";
import { BRAND_SIZE, PRIMARY_COLOR, TAX_CODE } from "./enums";

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
});
