// Pure catalog -> Flipkart row mapping. No I/O, no next/* imports.
// One product becomes one row per size; Group ID ties the variants together.

import type { ProductDoc, ProductVariantDoc } from "@/lib/catalog/types";
import { COLUMN_COUNT, COLUMNS, columnIndex, mandatoryColumns } from "./columns";
import {
  BRAND_SIZE,
  IDEAL_FOR,
  NUMBER_OF_APPAREL_COMBO,
  PATTERN,
  PATTERN_PRINT_TYPE,
  PRIMARY_COLOR,
  SLEEVE_LENGTH,
} from "./enums";
import { CONFIG, PLACEHOLDER, type FlipkartConfig } from "./config";

/** Flipkart separates multiple values in one cell with a double colon. */
export const MULTI = "::";

const MAX_SKU_LENGTH = 64;
const FORBIDDEN = /[\t\n\r]/;

/**
 * Dropdown-backed columns that can end up blank because the mapping missed, as
 * opposed to free-text columns that just carry whatever the config/catalog gives
 * them. Mandatory ones here already surface through `blanks`; the rest are what
 * `unmappedOptional` reports, so a missed optional dropdown never blanks silently.
 */
const DROPDOWN_COLUMNS = [
  "Brand Size",
  "Label Size",
  "Ideal For",
  "Primary Color",
  "Sleeve Length",
  "Pattern/Print Type",
  "Number of Apparel Combo",
];

/** Flipkart rejects a Group ID of 32 characters or more. */
export const MAX_GROUP_ID_LENGTH = 31;

/**
 * A short, stable Group ID for a product slug. Slugs run to 41 characters and
 * Flipkart caps the field, so a long slug is shortened and given a suffix
 * derived from the whole slug — keeping it readable while staying unique, and
 * identical for every size of the same product (which is what grouping needs).
 */
export function groupId(slug: string): string {
  if (slug.length <= MAX_GROUP_ID_LENGTH) return slug;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (Math.imul(hash, 31) + slug.charCodeAt(i)) | 0;
  }
  const suffix = (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
  const stem = slug.slice(0, MAX_GROUP_ID_LENGTH - 8).replace(/-+$/, "");
  return `${stem}-${suffix}`;
}

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingError";
  }
}

/** What the template already holds for this product: its SKU and Flipkart's images. */
export interface ExistingRow {
  rowIndex: number;
  sku: string;
  images: string[];
}

export interface MappedRow {
  cells: string[];
  /** Mandatory columns left empty because no value could be justified. */
  blanks: string[];
  /** Optional dropdown-backed columns left empty because no value could be justified. */
  unmappedOptional: string[];
}

export type MappingResult =
  | { status: "mapped"; rows: MappedRow[] }
  | { status: "skipped"; reason: string };

/** Returns `value` if the vocabulary allows it, otherwise "" so the caller reports a blank. */
function fromEnum(value: string | undefined, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : "";
}

/**
 * Same idea as `fromEnum` for a multi-valued cell: any value outside the vocabulary
 * is dropped rather than guessed, so a bad config entry blanks instead of shipping
 * a plausible-but-wrong print type.
 */
function fromEnumMulti(values: readonly string[], allowed: readonly string[]): string {
  return values.filter((v) => allowed.includes(v)).join(MULTI);
}

function sleeveLengthValue(slug: string, config: FlipkartConfig): string {
  const hit = config.sleeveLengthTokens.find(([token]) => slug.includes(token));
  return hit ? hit[1] : config.defaultSleeveLength;
}

function mapVariant(
  product: ProductDoc,
  variant: ProductVariantDoc,
  config: FlipkartConfig,
  category: FlipkartConfig["comboCategories"][string],
): MappedRow {
  const cells = new Array<string>(COLUMN_COUNT).fill("");
  const set = (name: string, value: string | number) => {
    cells[columnIndex(name)] = String(value);
  };

  // Product slug plus size. Every size is its own Flipkart listing and needs
  // its own SKU, so the size cannot be left off; the print is already in the
  // slug, so `variant.slug`'s trailing print would only repeat it. Not
  // editable once a listing exists, so it is worth getting right first time.
  const sku = `${product.slug}-${variant.size_slug ?? ""}`;
  set("Seller SKU ID", sku);
  set("Group ID", groupId(product.slug));
  set("Listing Status", "ACTIVE");
  set("MRP (INR)", variant.price + config.mrpMarkup);
  set("Your selling price (INR)", variant.price);
  set("Fullfilment by", config.fulfilmentBy);
  set("Procurement type", config.procurementType);
  set("Procurement SLA (DAY)", config.procurementSla);
  set("Stock", variant.stock_quantity);
  set("Shipping provider", config.shippingProvider);
  set("Local handling fee (INR)", config.localHandlingFee);
  set("Zonal handling fee (INR)", config.zonalHandlingFee);
  set("National handling fee (INR)", config.nationalHandlingFee);
  // Package size falls back to the config default when the category has no override.
  set("Length (CM)", category.lengthCm ?? config.lengthCm);
  set("Breadth (CM)", category.breadthCm ?? config.breadthCm);
  set("Height (CM)", category.heightCm ?? config.heightCm);
  set("Weight (KG)", category.weightKg ?? config.weightKg);
  set("HSN", config.hsn);
  set("Country Of Origin", config.countryOfOrigin);
  set("Manufacturer Details", config.manufacturerDetails);
  set("Packer Details", config.packerDetails);
  set("Tax Code", config.taxCode);
  set("Minimum Order Quantity (MinOQ)", config.minimumOrderQuantity);
  set("Brand", config.brand);

  const brandSize = fromEnum(config.sizeMap[variant.size_slug ?? ""], BRAND_SIZE);
  set("Brand Size", brandSize);
  set("Label Size", brandSize);
  // Ideal For must be identical across every row sharing a Group ID — Flipkart
  // rejects the group otherwise ("Grouping failed due to inconsistent values
  // for the following attributes: ideal_for"). So it is decided per PRODUCT,
  // not per size: the baby wording only when every size the product offers is
  // a baby size, otherwise the general wording covers the whole size run.
  const allBaby = (product.variants ?? []).every((v) =>
    config.babySizeSlugs.includes(v.size_slug ?? ""),
  );
  const genders = allBaby ? config.babyGenderMap : config.genderMap;
  set("Ideal For", fromEnum(genders[product.gender_slug], IDEAL_FOR));
  set("Primary Product Type", category.primaryProductType);
  set("Secondary Product Type", category.secondaryProductType.join(MULTI));
  set("Fabric", config.fabric.join(MULTI));
  // The print's own motif when we know it, else the generic fallback. The
  // same value feeds Pattern/Print Type below, which is why it must be legal
  // in both vocabularies.
  const motif = config.printPatternMap[variant.color_slug ?? ""] ?? "";
  set("Pattern", fromEnum(motif, PATTERN) || config.pattern.join(MULTI));
  set("Occasion", config.occasion);
  set("Fabric Care", config.fabricCare.join(MULTI));
  set("Items Included", category.itemsIncluded.join(MULTI));
  set("Style Code", product.slug);
  // The actual garment colour, not the print name. The verified listing reads
  // "Brand color = Beige"; "Petal Pops" is the print, and belongs in Model Name.
  const primaryColour = fromEnum(
    config.colourMap[product.base_colors?.[0] ?? ""],
    PRIMARY_COLOR,
  );
  set("Brand Color", primaryColour);
  set("Primary Color", primaryColour);

  // Our own originals: 2000x2000 public JPEGs, well past Flipkart's 200x1000
  // minimum and uncropped. The template's flixcart URLs are Flipkart's own
  // re-processed copies, whose resolution and cropping we do not control.
  // Flipkart takes at most 4; image 1 is the front view it wants as primary.
  const images = (product.images ?? []).slice(0, 4);
  set("Main Image URL", images[0] ?? "");
  set("Other Image URL 1", images[1] ?? "");
  set("Other Image URL 2", images[2] ?? "");
  set("Other Image URL 3", images[3] ?? "");

  set("Character", config.character);
  set(
    "Number of Apparel Combo",
    fromEnum(String(config.numberOfApparelCombo), NUMBER_OF_APPAREL_COMBO),
  );
  // Blank when the print has no mapped motif — an unmapped print must not
  // inherit the generic "Printed", which is illegal in this column.
  set(
    "Pattern/Print Type",
    fromEnum(motif, PATTERN_PRINT_TYPE) ||
      fromEnumMulti(config.patternPrintType, PATTERN_PRINT_TYPE),
  );
  set("Suitable for Gifting", config.suitableForGifting);
  set("Model Name", variant.color ?? "");
  set("Net Quantity", category.itemsIncluded.length);
  set("Description", product.description ?? "");
  set("Search Keywords", [product.name, product.category, variant.color].filter(Boolean).join(MULTI));
  set("Key Features", (product.features ?? []).join(MULTI));
  set("Sleeve Length", fromEnum(sleeveLengthValue(product.slug, config), SLEEVE_LENGTH));
  set("Ornamentation Type", config.ornamentationType.join(MULTI));

  // A config value still holding the placeholder marker is not a real value, no matter
  // which field it came from. Scrubbing every cell generically (instead of guarding each
  // `set()` call site individually) means a future config field that defaults to
  // PLACEHOLDER can't leak the literal into an exported cell just because nobody
  // remembered to wrap that one call site.
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === PLACEHOLDER) cells[i] = "";
  }

  // Under-declaring tax is not a cell we can leave blank and report — it is
  // wrong on a live, selling listing, so it stops the run.
  if (config.taxCodePriceCeiling > 0 && variant.price >= config.taxCodePriceCeiling) {
    throw new MappingError(
      `${sku} sells at ${variant.price}, at or above the ${config.taxCodePriceCeiling} ceiling ` +
        `for tax code "${config.taxCode}". Apparel above that threshold attracts a higher GST ` +
        `rate — switch to GST_APPAREL, which applies the slab per listing.`,
    );
  }

  if (sku.length > MAX_SKU_LENGTH) {
    throw new MappingError(
      `Seller SKU ID "${sku}" is ${sku.length} chars, over the 64 limit`,
    );
  }
  const dirty = cells.findIndex((c) => FORBIDDEN.test(c));
  if (dirty !== -1) {
    throw new MappingError(
      `Column "${columnName(dirty)}" contains a tab or newline, which would shift every later column`,
    );
  }

  const mandatoryColumnList = mandatoryColumns();
  const blanks = mandatoryColumnList
    .filter((col) => cells[col.index] === "")
    .map((col) => col.name);

  const mandatoryNames = new Set(mandatoryColumnList.map((col) => col.name));
  const unmappedOptional = DROPDOWN_COLUMNS.filter(
    (name) => !mandatoryNames.has(name) && cells[columnIndex(name)] === "",
  );

  return { cells, blanks, unmappedOptional };
}

function columnName(index: number): string {
  return COLUMNS[index]?.name || `column ${index}`;
}

/**
 * One row per variant. Returns `skipped` for products that belong to another template.
 *
 * `existing` is the product's row in the template, when it has one. Images no
 * longer come from it — we use our own 2000x2000 originals — so a product with
 * no template row still exports. It is kept so callers can report the join.
 */
export function mapProduct(
  product: ProductDoc,
  existing: ExistingRow | null,
  config: FlipkartConfig = CONFIG,
): MappingResult {
  const excluded = config.excludedCategories[product.category_slug];
  if (excluded) {
    return { status: "skipped", reason: `category ${product.category_slug} is excluded — ${excluded}` };
  }
  const category = config.comboCategories[product.category_slug];
  if (!category) {
    return { status: "skipped", reason: `category ${product.category_slug} is not a combo category` };
  }
  const rows = (product.variants ?? []).map((variant) =>
    mapVariant(product, variant, config, category),
  );
  return { status: "mapped", rows };
}
