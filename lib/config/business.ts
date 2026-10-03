/**
 * Public business identity: printed on tax invoices and shown at checkout.
 * business.test.ts fails while any value is blank or still an <owner: …>
 * marker, so an invoice can never ship with an empty seller block.
 * The GSTIN is deliberately NOT here; it is server-only (lib/config/gstin.ts).
 */
export const HSN_BABY_GARMENTS = "6111";
export const GST_RATE_PERCENT = 5;
/**
 * GST_RATE_PERCENT applies to garments up to this price a piece; above it the
 * rate is 18% (GST rates from 22 Sep 2025). Compared against the tax-inclusive
 * unit price, which is the conservative reading.
 */
export const GST_LOW_RATE_MAX_UNIT_PRICE = 2500;

export const STALL = {
  name: "Cozyberries Stall",
  addressLines: [
    "Inside the Cozyberries warehouse",
    "15, CN Enclave, Sultanpalya Main Rd, next to BDA Park",
    "Bengaluru 560032, Karnataka",
  ],
  hours: "Open daily · WhatsApp +91 74114 31101 before visiting",
  mapUrl: "https://maps.app.goo.gl/DiHYVTAmuJG4buE56",
} as const;

export const SELLER = {
  legalName: "Cozyberries",
  addressLines: [
    "15, CN Enclave, Sultanpalya Main Rd, next to BDA Park",
    "Bengaluru 560032, Karnataka, India",
  ],
  stateName: "Karnataka",
  /** Must equal the first two digits of BUSINESS_GSTIN. */
  stateCode: "29",
} as const;

/** First month Cozyberries was GST-registered (YYYY-MM). No sales register exists before it. */
export const GST_REGISTERED_FROM = "2026-09";

/** GSTR-1 table 5 (B2CL): inter-state B2C invoices above ₹1,00,000 are reported one by one. */
export const B2CL_LIMIT_PAISE = 100_000_00;

/** HSN 6111 as GSTR-1 table 12 describes it. */
export const HSN_DESCRIPTION = "Babies' garments and clothing accessories, knitted or crocheted";

/** GSTR-1 unit quantity code for pieces. */
export const UQC_PIECES = "PCS-PIECES";
