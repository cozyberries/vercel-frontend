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
  /**
   * Package size for this category, when it differs from the config default.
   * A newborn kit is several garments in one box; a two-piece set is a flat
   * poly bag. Omit to inherit `lengthCm`/`breadthCm`/`heightCm`/`weightKg`.
   */
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  weightKg?: number;
}

export interface FlipkartConfig {
  brand: string;
  hsn: string;
  taxCode: string;
  /**
   * Selling price at or above which `taxCode` stops being correct, or 0 to
   * disable the check. A flat rate is only safe below the apparel GST slab
   * boundary; mapping aborts rather than ship an under-declared row.
   */
  taxCodePriceCeiling: number;
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
  /**
   * Print slug (the `colors` row, e.g. "petal-pops") -> the motif it shows.
   * Drives both Pattern (col 38) and Pattern/Print Type (col 53), so every
   * value must be legal in BOTH vocabularies. A print that is absent falls
   * back to the generic `pattern` and leaves col 53 blank, and the export
   * report names it — better than guessing a motif onto a live page.
   */
  printPatternMap: Record<string, string>;
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
  /** catalog gender_slug -> Flipkart Ideal For, for sizes above 24 months */
  genderMap: Record<string, string>;
  /** Size slugs Flipkart treats as "Baby" (24 months and under). */
  babySizeSlugs: string[];
  /** catalog gender_slug -> Flipkart Ideal For, for the baby sizes above */
  babyGenderMap: Record<string, string>;
  /** Ordered slug substring -> Sleeve Length. First match wins. */
  sleeveLengthTokens: Array<[string, string]>;
  defaultSleeveLength: string;
  /** Only these categories belong in the kids_apparel_combo template. */
  comboCategories: Record<string, ComboCategory>;
  /**
   * Combo categories deliberately held back from this export, mapped to why.
   * Distinct from a non-combo category: these belong in this template, we are
   * just not listing them right now. The reason reaches the report verbatim.
   */
  excludedCategories: Record<string, string>;
}

export const CONFIG: FlipkartConfig = {
  // Exactly as it renders on the verified listing KPBHR597CWGAGUAG — lowercase
  // "b". Brand must match what Seller Hub approved or QC fails on every row.
  brand: "Cozyberries",
  // 6209 = babies' garments NOT knitted or crocheted. Muslin is woven, so this
  // is chapter 62, not the 61112000 (knitted) we started with. Taken from the
  // manually verified listing. Open question for the CA: heading 6209 covers
  // body height <= 86 cm, so sizes 2-3Y and up may belong under 6203 instead.
  hsn: "62092090",
  // Flat 5%. Valid only while every exported row sells under Rs 1000 — apparel
  // above that threshold attracts a higher rate, and a flat GST_5 would then
  // under-declare tax. True today because the Rs 1784 newborn kits are
  // excluded; `taxCodePriceCeiling` is the guard that fails loudly if they
  // come back or any price crosses it.
  taxCode: "GST_5",
  taxCodePriceCeiling: 1000,
  countryOfOrigin: "India",
  // Legally required on the listing.
  manufacturerDetails: "CozyBerries, R T Nagar, Bengaluru, Karnataka 560032, India",
  packerDetails: "CozyBerries, R T Nagar, Bengaluru, Karnataka 560032, India",
  mrpMarkup: 200,
  // QC: "[fulfilled_by]: Invalid value given for attribute: service_profile.
  // Allowed values are: FA,seller,SellerSmart" — lowercase, not SELLER.
  fulfilmentBy: "seller",
  // QC: "[Procurement type]: Invalid value ... Allowed values are: QUICK,
  // REGULAR,EXPRESS,DOMESTIC,MADE_TO_ORDER,INTERNATIONAL". The Seller Hub UI
  // shows "Instock", but the bulk API wants one of these; EXPRESS matches the
  // 1-day dispatch SLA below.
  procurementType: "EXPRESS",
  procurementSla: 1,
  shippingProvider: "FLIPKART",
  localHandlingFee: 0,
  zonalHandlingFee: 0,
  nationalHandlingFee: 0,
  // Couriers bill on whichever is greater, actual or volumetric weight, where
  // volumetric = L*B*H/5000. A flat-packed two-piece muslin set weighs 200 g
  // with packaging, so the box is sized to land volumetric on the same number:
  // 25*20*2/5000 = 0.2 kg. Anything taller is paid-for air.
  lengthCm: 25,
  breadthCm: 20,
  heightCm: 2,
  weightKg: 0.2,
  minimumOrderQuantity: 1,
  fabric: ["Muslin"],
  pattern: ["Printed"],
  // Deliberately empty, not an oversight: our prints aren't uniformly one print type
  // (Petal Pops and Lilac Blossom are floral; Moons and Stars and Rocket Rangers are
  // not), so any single default here would be a guess. Blank is correct — and
  // reported as such — until someone maps Pattern/Print Type per print.
  patternPrintType: [],

  // Guessed from the print names, as agreed. Values are legal in both the
  // Pattern and Pattern/Print Type vocabularies. The four prints whose names
  // read like colours rather than motifs — soft-pear, soft-coral, baby-blush,
  // coconut-milk — are deliberately absent: they may well be solids, and the
  // report lists them so they get a human's eye instead of a guess.
  printPatternMap: {
    "petal-pops": "Floral Print",
    "lilac-blossom": "Floral Print",
    "aloe-mist": "Floral Print",
    "pine-cone": "Floral Print",
    "joyful-orbs": "Polka Print",
    "moon-and-stars": "Graphic Print",
    "rocket-ranger": "Graphic Print",
    "popsicles": "Graphic Print",
    "mushie-mini": "Graphic Print",
    "naugthy-nuts": "Graphic Print",
  },
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

  // Flipkart splits "Baby" from the rest at 24 months, and the verified 0-3M
  // listing reads "Ideal for = Baby Boys". Ideal For is per listing and each
  // size is its own listing, so it follows the size rather than the product.
  babySizeSlugs: ["0-3m", "3-6m", "6-12m", "1-2y"],
  babyGenderMap: {
    boy: "Baby Boys",
    girl: "Baby Girls",
    unisex: "Baby Boys & Baby Girls",
  },

  sleeveLengthTokens: [
    ["half-sleeve", "Half Sleeve"],
    ["sleeveless", "Sleeveless"],
    ["full-sleeve", "Full Sleeve"],
    ["butterfly-sleeve", "Short Sleeve"],
  ],
  defaultSleeveLength: "NA",

  comboCategories: {
    // Secondary product type is the OTHER garment, never a repeat of the
    // primary: the verified listing reads "Primary = Shirt, Secondary =
    // Trouser". Items Included stays the full contents of the box.
    "boys-coord-sets": {
      primaryProductType: "Shirt",
      secondaryProductType: ["Shorts"],
      itemsIncluded: ["Shirt", "Shorts"],
    },
    "girls-coord-sets": {
      primaryProductType: "Top",
      secondaryProductType: ["Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    "half-sleeve-jabla-and-shorts": {
      primaryProductType: "Top",
      secondaryProductType: ["Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    "sleeveless-jabla-and-shorts": {
      primaryProductType: "Top",
      secondaryProductType: ["Shorts"],
      itemsIncluded: ["Top", "Shorts"],
    },
    // Currently excluded — see `excludedCategories`. Mapping kept so it is
    // ready to list again without re-deriving anything.
    "newborn-essentials": {
      primaryProductType: "Top",
      secondaryProductType: ["Shorts"],
      itemsIncluded: ["Top", "Shorts"],
      // A multi-garment kit, not a two-piece set. Sized on the same rule:
      // 30*20*5/5000 = 0.6 kg volumetric, matching the actual weight.
      lengthCm: 30,
      breadthCm: 20,
      heightCm: 5,
      weightKg: 0.6,
    },
  },

  excludedCategories: {
    "newborn-essentials": "out of stock",
  },
};

/** Config keys still holding the placeholder marker, in declaration order. */
export function placeholderFields(config: FlipkartConfig): string[] {
  return Object.entries(config)
    .filter(([, value]) => value === PLACEHOLDER)
    .map(([key]) => key);
}
