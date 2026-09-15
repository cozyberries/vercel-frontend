// The 69 columns of the Flipkart kids_apparel_combo template, in sheet order.
// `obligation` is read off the header row's cell fill colour:
//   blue -> mandatory, purple -> conditional, green -> optional, grey -> flipkart.

export type Obligation = "mandatory" | "conditional" | "optional" | "flipkart";

export interface ColumnSpec {
  index: number;
  name: string;
  obligation: Obligation;
}

export const COLUMN_COUNT = 69;

const SPEC: ReadonlyArray<readonly [string, Obligation]> = [
  ["Flipkart Serial Number", "flipkart"],
  ["Catalog QC Status", "flipkart"],
  ["QC Failed Reason (if any)", "flipkart"],
  ["Flipkart Product Link", "conditional"],
  ["Product Data Status", "flipkart"],
  ["Disapproval Reason (if any)", "flipkart"],
  ["Seller SKU ID", "mandatory"],
  ["Group ID", "optional"],
  ["", "optional"],
  ["Listing Status", "conditional"],
  ["MRP (INR)", "mandatory"],
  ["Your selling price (INR)", "mandatory"],
  ["Fullfilment by", "mandatory"],
  ["Procurement type", "conditional"],
  ["Procurement SLA (DAY)", "conditional"],
  ["Stock", "conditional"],
  ["Shipping provider", "conditional"],
  ["Local handling fee (INR)", "conditional"],
  ["Zonal handling fee (INR)", "conditional"],
  ["National handling fee (INR)", "conditional"],
  ["Length (CM)", "conditional"],
  ["Breadth (CM)", "conditional"],
  ["Height (CM)", "conditional"],
  ["Weight (KG)", "conditional"],
  ["HSN", "mandatory"],
  ["Luxury Cess", "optional"],
  ["Country Of Origin", "mandatory"],
  ["Manufacturer Details", "mandatory"],
  ["Packer Details", "mandatory"],
  ["Importer Details", "conditional"],
  ["Tax Code", "mandatory"],
  ["Minimum Order Quantity (MinOQ)", "optional"],
  ["Brand", "mandatory"],
  ["Label Size", "mandatory"],
  ["Ideal For", "mandatory"],
  ["Primary Product Type", "mandatory"],
  ["Secondary Product Type", "mandatory"],
  ["Fabric", "mandatory"],
  ["Pattern", "mandatory"],
  ["Occasion", "mandatory"],
  ["Fabric Care", "mandatory"],
  ["Items Included", "mandatory"],
  ["Style Code", "mandatory"],
  ["Brand Size", "mandatory"],
  ["Brand Color", "mandatory"],
  ["Primary Color", "mandatory"],
  ["Main Image URL", "mandatory"],
  ["Other Image URL 1", "optional"],
  ["Other Image URL 2", "optional"],
  ["Other Image URL 3", "optional"],
  ["Character", "optional"],
  ["Number of Apparel Combo", "optional"],
  ["Video URL", "optional"],
  ["Pattern/Print Type", "optional"],
  ["Detail Placement", "optional"],
  ["Suitable for Gifting", "optional"],
  ["Fabric Details", "optional"],
  ["Model Name", "optional"],
  ["Net Quantity", "optional"],
  ["Description", "optional"],
  ["Search Keywords", "optional"],
  ["Key Features", "optional"],
  ["Secondary Color", "optional"],
  ["Other Dimensions", "optional"],
  ["Other Features", "optional"],
  ["Sleeve Length", "optional"],
  ["Ornamentation Type", "optional"],
  ["EAN/UPC", "optional"],
  ["Supplier Image", "optional"],
];

export const COLUMNS: readonly ColumnSpec[] = Object.freeze(
  SPEC.map(([name, obligation], index) => Object.freeze({ index, name, obligation })),
);

const BY_NAME = new Map(COLUMNS.filter((c) => c.name).map((c) => [c.name, c.index]));

export function columnIndex(name: string): number {
  const index = BY_NAME.get(name);
  if (index === undefined) throw new Error(`Unknown Flipkart column: ${name}`);
  return index;
}

/** Mandatory columns the seller must fill — excludes the two Flipkart fills blue. */
export function mandatoryColumns(): readonly ColumnSpec[] {
  return COLUMNS.filter((c) => c.obligation === "mandatory");
}
