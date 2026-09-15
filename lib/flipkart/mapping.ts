// Pure catalog -> Flipkart row mapping. No I/O, no next/* imports.
// One product becomes one row per size; Group ID ties the variants together.

import type { ProductDoc, ProductVariantDoc } from "@/lib/catalog/types";
import { COLUMN_COUNT, COLUMNS, columnIndex, mandatoryColumns } from "./columns";
import {
  BRAND_SIZE,
  IDEAL_FOR,
  NUMBER_OF_APPAREL_COMBO,
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
  existing: ExistingRow,
  config: FlipkartConfig,
  category: FlipkartConfig["comboCategories"][string],
): MappedRow {
  const cells = new Array<string>(COLUMN_COUNT).fill("");
  const set = (name: string, value: string | number) => {
    cells[columnIndex(name)] = String(value);
  };

  set("Seller SKU ID", variant.slug);
  set("Group ID", product.slug);
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
  set("Length (CM)", config.lengthCm);
  set("Breadth (CM)", config.breadthCm);
  set("Height (CM)", config.heightCm);
  set("Weight (KG)", config.weightKg);
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
  set("Ideal For", fromEnum(config.genderMap[product.gender_slug], IDEAL_FOR));
  set("Primary Product Type", category.primaryProductType);
  set("Secondary Product Type", category.secondaryProductType.join(MULTI));
  set("Fabric", config.fabric.join(MULTI));
  set("Pattern", config.pattern.join(MULTI));
  set("Occasion", config.occasion);
  set("Fabric Care", config.fabricCare.join(MULTI));
  set("Items Included", category.itemsIncluded.join(MULTI));
  set("Style Code", product.slug);
  set("Brand Color", variant.color ?? "");
  set("Primary Color", fromEnum(config.colourMap[product.base_colors?.[0] ?? ""], PRIMARY_COLOR));

  set("Main Image URL", existing.images[0] ?? "");
  set("Other Image URL 1", existing.images[1] ?? "");
  set("Other Image URL 2", existing.images[2] ?? "");
  set("Other Image URL 3", existing.images[3] ?? "");

  set("Character", config.character);
  set(
    "Number of Apparel Combo",
    fromEnum(String(config.numberOfApparelCombo), NUMBER_OF_APPAREL_COMBO),
  );
  set("Pattern/Print Type", fromEnumMulti(config.patternPrintType, PATTERN_PRINT_TYPE));
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

  if (variant.slug.length > MAX_SKU_LENGTH) {
    throw new MappingError(
      `Seller SKU ID "${variant.slug}" is ${variant.slug.length} chars, over the 64 limit`,
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

/** One row per variant. Returns `skipped` for products that belong to another template. */
export function mapProduct(
  product: ProductDoc,
  existing: ExistingRow,
  config: FlipkartConfig = CONFIG,
): MappingResult {
  const category = config.comboCategories[product.category_slug];
  if (!category) {
    return { status: "skipped", reason: `category ${product.category_slug} is not a combo category` };
  }
  const rows = (product.variants ?? []).map((variant) =>
    mapVariant(product, variant, existing, config, category),
  );
  return { status: "mapped", rows };
}
