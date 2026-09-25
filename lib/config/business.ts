/**
 * Public business identity: printed on tax invoices and shown at checkout.
 * business.test.ts fails while any value is blank or still an <owner: …>
 * marker, so an invoice can never ship with an empty seller block.
 * The GSTIN is deliberately NOT here; it is server-only (lib/config/gstin.ts).
 */
export const HSN_BABY_GARMENTS = "6111";
export const GST_RATE_PERCENT = 5;

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
  tradeName: "CozyBerries",
  addressLines: [
    "15, CN Enclave, Sultanpalya Main Rd, next to BDA Park",
    "Bengaluru 560032, Karnataka, India",
  ],
  stateName: "Karnataka",
  /** Must equal the first two digits of BUSINESS_GSTIN. */
  stateCode: "29",
} as const;
