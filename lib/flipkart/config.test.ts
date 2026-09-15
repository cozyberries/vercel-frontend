import { describe, expect, it } from "vitest";
import { CONFIG, PLACEHOLDER, placeholderFields } from "./config";
import {
  CHARACTER, FABRIC, FABRIC_CARE, IDEAL_FOR, OCCASION, ORNAMENTATION_TYPE, PATTERN,
  PATTERN_PRINT_TYPE, PRIMARY_COLOR, PRIMARY_PRODUCT_TYPE, SECONDARY_PRODUCT_TYPE,
  SLEEVE_LENGTH, BRAND_SIZE, TAX_CODE, FULFILMENT_BY, PROCUREMENT_TYPE,
} from "./enums";

describe("CONFIG", () => {
  it("never lets volumetric weight exceed the actual weight we pay for", () => {
    // Couriers bill max(actual, L*B*H/5000). A box bigger than the rule allows
    // is a standing overcharge on every single shipment, invisible in the sheet.
    const check = (l: number, b: number, h: number, kg: number, label: string) => {
      expect((l * b * h) / 5000, `${label} box bills as volumetric weight`).toBeLessThanOrEqual(kg);
    };
    check(CONFIG.lengthCm, CONFIG.breadthCm, CONFIG.heightCm, CONFIG.weightKg, "default");
    for (const [slug, c] of Object.entries(CONFIG.comboCategories)) {
      if (c.lengthCm === undefined) continue;
      check(
        c.lengthCm,
        c.breadthCm ?? CONFIG.breadthCm,
        c.heightCm ?? CONFIG.heightCm,
        c.weightKg ?? CONFIG.weightKg,
        slug,
      );
    }
  });

  it("carries the confirmed business values", () => {
    expect(CONFIG.hsn).toBe("62092090"); // chapter 62: muslin is woven, not knitted
    expect(CONFIG.taxCode).toBe("GST_5");
    expect(CONFIG.mrpMarkup).toBe(200);
    expect(CONFIG.countryOfOrigin).toBe("India");
  });

  it("uses only legal dropdown values", () => {
    expect(TAX_CODE).toContain(CONFIG.taxCode);
    expect(OCCASION).toContain(CONFIG.occasion);
    expect(CHARACTER).toContain(CONFIG.character);
    expect(FULFILMENT_BY).toContain(CONFIG.fulfilmentBy);
    expect(PROCUREMENT_TYPE).toContain(CONFIG.procurementType);
    CONFIG.fabric.forEach((v) => expect(FABRIC).toContain(v));
    CONFIG.pattern.forEach((v) => expect(PATTERN).toContain(v));
    CONFIG.fabricCare.forEach((v) => expect(FABRIC_CARE).toContain(v));
    CONFIG.ornamentationType.forEach((v) => expect(ORNAMENTATION_TYPE).toContain(v));
    CONFIG.patternPrintType.forEach((v) => expect(PATTERN_PRINT_TYPE).toContain(v));
  });

  it("leaves Pattern/Print Type empty rather than guessing a single print for every product", () => {
    // Vacuously true while patternPrintType is [], but locks the guard in: if someone
    // adds a value later, it still has to be a legal PATTERN_PRINT_TYPE member.
    expect(CONFIG.patternPrintType).toEqual([]);
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

  it("maps every catalog gender to a legal Ideal For, baby and older alike", () => {
    for (const g of ["boy", "girl", "unisex"]) {
      expect(IDEAL_FOR).toContain(CONFIG.genderMap[g]);
      expect(IDEAL_FOR).toContain(CONFIG.babyGenderMap[g]);
    }
  });

  it("treats only sizes of 24 months and under as baby sizes", () => {
    expect(CONFIG.babySizeSlugs).toEqual(["0-3m", "3-6m", "6-12m", "1-2y"]);
    for (const slug of CONFIG.babySizeSlugs) {
      expect(CONFIG.sizeMap[slug], `${slug} is a baby size but has no Brand Size`).toBeDefined();
    }
  });

  it("uses the brand exactly as the verified listing renders it", () => {
    expect(CONFIG.brand).toBe("Cozyberries");
  });

  it("never repeats the primary garment in secondary product type", () => {
    for (const [slug, c] of Object.entries(CONFIG.comboCategories)) {
      expect(c.secondaryProductType, `${slug} repeats its primary`).not.toContain(
        c.primaryProductType,
      );
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
  it("names every field still holding the marker", () => {
    const unfilled = { ...CONFIG, manufacturerDetails: PLACEHOLDER, packerDetails: PLACEHOLDER };
    expect(placeholderFields(unfilled)).toEqual(["manufacturerDetails", "packerDetails"]);
  });

  it("reports nothing for the shipped config, which has no placeholders left", () => {
    expect(placeholderFields(CONFIG)).toEqual([]);
  });

  it("carries the real manufacturer and packer address, with no marker left", () => {
    const address = "CozyBerries, R T Nagar, Bengaluru, Karnataka 560032, India";
    expect(CONFIG.manufacturerDetails).toBe(address);
    expect(CONFIG.packerDetails).toBe(address);
    expect(JSON.stringify(CONFIG)).not.toContain("EDIT_ME");
  });

  it("excludes newborn kits while keeping their mapping ready to relist", () => {
    expect(CONFIG.excludedCategories["newborn-essentials"]).toBe("out of stock");
    expect(CONFIG.comboCategories["newborn-essentials"]).toBeDefined();
  });

  it("only excludes categories that are combo categories in the first place", () => {
    for (const slug of Object.keys(CONFIG.excludedCategories)) {
      expect(CONFIG.comboCategories[slug], `${slug} is excluded but not a combo category`).toBeDefined();
    }
  });

  it("returns nothing once every placeholder is replaced", () => {
    const filled = { ...CONFIG, manufacturerDetails: "A, Bengaluru 560001", packerDetails: "A, Bengaluru 560001" };
    expect(placeholderFields(filled)).toEqual([]);
  });

  it("reports any field holding the placeholder marker", () => {
    expect(placeholderFields({ ...CONFIG, brand: PLACEHOLDER })).toContain("brand");
  });
});
