// Pure catalog -> Flipkart row mapping. No I/O, no next/* imports.
// One product becomes one row per size; Group ID ties the variants together.

import type { ProductDoc, ProductVariantDoc } from "@/lib/catalog/types";
import { COLUMN_COUNT, COLUMNS, columnIndex, mandatoryColumns } from "./columns";
import { BRAND_SIZE, IDEAL_FOR, PRIMARY_COLOR, SLEEVE_LENGTH } from "./enums";
import { CONFIG, PLACEHOLDER, type FlipkartConfig } from "./config";

/** Flipkart separates multiple values in one cell with a double colon. */
export const MULTI = "::";

const MAX_SKU_LENGTH = 64;
const FORBIDDEN = /[\t\n\r]/;

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
}

export type MappingResult =
  | { status: "mapped"; rows: MappedRow[] }
  | { status: "skipped"; reason: string };

/** Returns `value` if the vocabulary allows it, otherwise "" so the caller reports a blank. */
function fromEnum(value: string | undefined, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : "";
}

function sleeveLength(slug: string, config: FlipkartConfig): string {
  const hit = config.sleeveLengthTokens.find(([token]) => slug.includes(token));
  return fromEnum(hit ? hit[1] : config.defaultSleeveLength, SLEEVE_LENGTH);
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
  // A config value still holding the marker is not a real value.
  const real = (value: string) => (value === PLACEHOLDER ? "" : value);

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
  set("Manufacturer Details", real(config.manufacturerDetails));
  set("Packer Details", real(config.packerDetails));
  set("Tax Code", config.taxCode);
  set("Minimum Order Quantity (MinOQ)", config.minimumOrderQuantity);
  set("Brand", real(config.brand));

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
  set("Number of Apparel Combo", config.numberOfApparelCombo);
  set("Pattern/Print Type", config.pattern.join(MULTI));
  set("Suitable for Gifting", config.suitableForGifting);
  set("Model Name", variant.color ?? "");
  set("Net Quantity", category.itemsIncluded.length);
  set("Description", product.description ?? "");
  set("Search Keywords", [product.name, product.category, variant.color].filter(Boolean).join(MULTI));
  set("Key Features", (product.features ?? []).join(MULTI));
  set("Sleeve Length", sleeveLength(product.slug, config));
  set("Ornamentation Type", config.ornamentationType.join(MULTI));

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

  const blanks = mandatoryColumns()
    .filter((col) => cells[col.index] === "")
    .map((col) => col.name);

  return { cells, blanks };
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
