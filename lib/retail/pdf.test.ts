import { describe, expect, it } from "vitest";
import { doc, line, retailer } from "./__fixtures__/retail";
import { buildChallan, buildRetailInvoice } from "./documents";
import { renderChallanPdf, renderRetailInvoicePdf } from "./pdf";

const GSTIN = "29EPDPR9174E1ZB";

describe("retail PDFs", () => {
  it("renders the invoice as a PDF", async () => {
    const pdf = await renderRetailInvoicePdf(buildRetailInvoice({ doc: doc(), retailer: retailer(), gstin: GSTIN, challanNumbers: ["CBC/26-27/0001"] }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);

  it("renders the challan as a PDF", async () => {
    const pdf = await renderChallanPdf(buildChallan({ doc: doc({ kind: "challan", period: null, consignment_lines: [line({ quantity: 2 })] }), retailer: retailer(), gstin: GSTIN }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);
});
