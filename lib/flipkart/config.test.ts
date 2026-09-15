import { describe, expect, it } from "vitest";
import { CONFIG, PLACEHOLDER, placeholderFields } from "./config";
import {
  FABRIC, FABRIC_CARE, IDEAL_FOR, OCCASION, ORNAMENTATION_TYPE, PATTERN,
  PRIMARY_COLOR, PRIMARY_PRODUCT_TYPE, SECONDARY_PRODUCT_TYPE, SLEEVE_LENGTH,
  BRAND_SIZE, TAX_CODE,
} from "./enums";

describe("CONFIG", () => {
  it("carries the confirmed business values", () => {
    expect(CONFIG.hsn).toBe("61112000");
    expect(CONFIG.taxCode).toBe("GST_APPAREL");
    expect(CONFIG.mrpMarkup).toBe(200);
    expect(CONFIG.countryOfOrigin).toBe("IN");
  });

  it("uses only legal dropdown values", () => {
    expect(TAX_CODE).toContain(CONFIG.taxCode);
    expect(OCCASION).toContain(CONFIG.occasion);
    CONFIG.fabric.forEach((v) => expect(FABRIC).toContain(v));
    CONFIG.pattern.forEach((v) => expect(PATTERN).toContain(v));
    CONFIG.fabricCare.forEach((v) => expect(FABRIC_CARE).toContain(v));
    CONFIG.ornamentationType.forEach((v) => expect(ORNAMENTATION_TYPE).toContain(v));
  });

  it("maps every catalog size to a legal Brand Size", () => {
    const sizes = ["0-3m", "3-6m", "6-12m", "1-2y", "2-3y", "3-4y", "4-5y", "5-6y"];
    for (const s of sizes) {
      expect(CONFIG.sizeMap[s], `missing size ${s}`).toBeDefined();
      expect(BRAND_SIZE).toContain(CONFIG.sizeMap[s]);
    }
  });

  it("maps every catalog base colour to a legal Primary Color", () => {
    const colours = ["beige", "cream", "green", "lilac", "peach", "pink", "white"];
    for (const c of colours) {
      expect(CONFIG.colourMap[c], `missing colour ${c}`).toBeDefined();
      expect(PRIMARY_COLOR).toContain(CONFIG.colourMap[c]);
    }
    expect(CONFIG.colourMap.cream).toBe("Beige");
    expect(CONFIG.colourMap.lilac).toBe("Purple");
    expect(CONFIG.colourMap.peach).toBe("Orange");
  });

  it("maps every catalog gender to a legal Ideal For", () => {
    for (const g of ["boy", "girl", "unisex"]) {
      expect(IDEAL_FOR).toContain(CONFIG.genderMap[g]);
    }
  });

  it("maps every combo category to legal product types", () => {
    const expected = [
      "boys-coord-sets", "girls-coord-sets", "half-sleeve-jabla-and-shorts",
      "sleeveless-jabla-and-shorts", "newborn-essentials",
    ];
    expect(Object.keys(CONFIG.comboCategories).sort()).toEqual([...expected].sort());
    for (const cat of Object.values(CONFIG.comboCategories)) {
      expect(PRIMARY_PRODUCT_TYPE).toContain(cat.primaryProductType);
      cat.secondaryProductType.forEach((v) => expect(SECONDARY_PRODUCT_TYPE).toContain(v));
      cat.itemsIncluded.forEach((v) => expect(SECONDARY_PRODUCT_TYPE).toContain(v));
    }
  });

  it("uses legal sleeve-length values in its slug tokens", () => {
    CONFIG.sleeveLengthTokens.forEach(([, value]) => expect(SLEEVE_LENGTH).toContain(value));
    expect(SLEEVE_LENGTH).toContain(CONFIG.defaultSleeveLength);
  });
});

describe("placeholderFields", () => {
  it("names the addresses that still need real values", () => {
    expect(placeholderFields(CONFIG)).toEqual(["manufacturerDetails", "packerDetails"]);
  });

  it("returns nothing once every placeholder is replaced", () => {
    const filled = { ...CONFIG, manufacturerDetails: "A, Bengaluru 560001", packerDetails: "A, Bengaluru 560001" };
    expect(placeholderFields(filled)).toEqual([]);
  });

  it("reports any field holding the placeholder marker", () => {
    expect(placeholderFields({ ...CONFIG, brand: PLACEHOLDER })).toContain("brand");
  });
});
