// Business facts the CozyBerries catalog does not model, plus the mapping tables
// from our vocabulary to Flipkart's. Hand-edited. config.test.ts asserts every
// value here is legal, so a typo fails a test instead of a Flipkart upload.

import {
  FABRIC,
  FABRIC_CARE,
  IDEAL_FOR,
  OCCASION,
  ORNAMENTATION_TYPE,
  PATTERN,
  PRIMARY_COLOR,
  PRIMARY_PRODUCT_TYPE,
  SECONDARY_PRODUCT_TYPE,
  SLEEVE_LENGTH,
  BRAND_SIZE,
  TAX_CODE,
} from "./enums";

// PATTERN_PRINT_TYPE itself isn't imported here — config.ts only declares the shape;
// config.test.ts is what checks CONFIG.patternPrintType against it.

/** Marks a value that must be replaced with a real one before upload. */
export const PLACEHOLDER = "<<PLACEHOLDER>>";

export interface ComboCategory {
  primaryProductType: string;
  secondaryProductType: string[];
  itemsIncluded: string[];
}

export interface FlipkartConfig {
  brand: string;
  hsn: string;
  taxCode: string;
  countryOfOrigin: string;
  manufacturerDetails: string;
  packerDetails: string;
  /** MRP = selling price + this. */
  mrpMarkup: number;
  fulfilmentBy: string;
  procurementType: string;
  procurementSla: number;
  shippingProvider: string;
  localHandlingFee: number;
  zonalHandlingFee: number;
  nationalHandlingFee: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
  minimumOrderQuantity: number;
  fabric: string[];
  pattern: string[];
  /** Column 53 dropdown — separate vocabulary from `pattern` (column 38). */
  patternPrintType: string[];
  occasion: string;
  fabricCare: string[];
  ornamentationType: string[];
  character: string;
  suitableForGifting: string;
  numberOfApparelCombo: number;
  /** catalog size_slug -> Flipkart Brand Size */
  sizeMap: Record<string, string>;
  /** catalog base_color -> Flipkart Primary Color */
  colourMap: Record<string, string>;
  /** catalog gender_slug -> Flipkart Ideal For */
  genderMap: Record<string, string>;
  /** Ordered slug substring -> Sleeve Length. First match wins. */
  sleeveLengthTokens: Array<[string, string]>;
  defaultSleeveLength: string;
  /** Only these categories belong in the kids_apparel_combo template. */
  comboCategories: Record<string, ComboCategory>;
}

export const CONFIG: FlipkartConfig = {
  brand: "CozyBerries",
  hsn: "61112000",
  taxCode: "GST_APPAREL", // slab-aware: 5% under 1000, correct for the 1784 newborn kits
  countryOfOrigin: "IN",
  manufacturerDetails: PLACEHOLDER,
  packerDetails: PLACEHOLDER,
  mrpMarkup: 200,
  fulfilmentBy: "SELLER",
  procurementType: "EXPRESS",
  procurementSla: 2,
  shippingProvider: "FLIPKART",
  localHandlingFee: 0,
  zonalHandlingFee: 0,
  nationalHandlingFee: 0,
  lengthCm: 25,
  breadthCm: 20,
  heightCm: 4,
  weightKg: 0.2,
  minimumOrderQuantity: 1,
  fabric: ["Muslin"],
  pattern: ["Printed"],
  // Deliberately empty, not an oversight: our prints aren't uniformly one print type
  // (Petal Pops and Lilac Blossom are floral; Moons and Stars and Rocket Rangers are
  // not), so any single default here would be a guess. Blank is correct — and
  // reported as such — until someone maps Pattern/Print Type per print.
  patternPrintType: [],
  occasion: "Casual",
  fabricCare: ["Gentle Machine Wash", "Do not bleach", "Dry in shade", "Wash with like colors"],
  ornamentationType: ["None"],
  character: "No Character",
  suitableForGifting: "Yes",
  numberOfApparelCombo: 1,

  sizeMap: {
    "0-3m": "0 - 3 Months",
    "3-6m": "3 - 6 Months",
    "6-12m": "6 - 12 Months",
    "1-2y": "1 - 2 Years",
    "2-3y": "2 - 3 Years",
    "3-4y": "3 - 4 Years",
    "4-5y": "4 - 5 Years",
    "5-6y": "5 - 6 Years",
  },

  // Flipkart's 20-colour list has no Cream, Lilac or Peach; these three are
  // nearest-match judgement calls, kept here so they stay visible.
  colourMap: {
    beige: "Beige",
    white: "White",
    green: "Green",
    pink: "Pink",
    cream: "Beige",
    lilac: "Purple",
    peach: "Orange",
  },

  genderMap: {
    boy: "Boys",
    girl: "Girls",
    unisex: "Boys & Girls",
  },

  sleeveLengthTokens: [
    ["half-sleeve", "Half Sleeve"],
    ["sleeveless", "Sleeveless"],
    ["full-sleeve", "Full Sleeve"],
    ["butterfly-sleeve", "Short Sleeve"],
  ],
  defaultSleeveLength: "NA",

  comboCategories: {
    "boys-coord-sets": {
      primaryProductType: "Shirt",
      secondaryProductType: ["Shirt", "Shorts"],
      itemsIncluded: ["Shirt", "Shorts"],
    },
    "girls-coord-sets": {
      primaryProductType: "Top",
      secondaryProductType: ["Top", "Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    "half-sleeve-jabla-and-shorts": {
      primaryProductType: "Top",
      secondaryProductType: ["Top", "Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    "sleeveless-jabla-and-shorts": {
      primaryProductType: "Top",
      secondaryProductType: ["Top", "Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    "newborn-essentials": {
      primaryProductType: "Top",
      secondaryProductType: ["Top", "Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
  },
};

/** Config keys still holding the placeholder marker, in declaration order. */
export function placeholderFields(config: FlipkartConfig): string[] {
  return Object.entries(config)
    .filter(([, value]) => value === PLACEHOLDER)
    .map(([key]) => key);
}
