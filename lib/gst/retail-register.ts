import { GST_RATE_PERCENT } from "@/lib/config/business";
import { buildRetailInvoice } from "@/lib/retail/documents";
import type { ConsignmentDoc, Retailer } from "@/lib/retail/types";
import type { B2bInvoice } from "./register-types";

/** A shop invoice row as the register reads it (issued or cancelled, with a number). */
export type RetailRegisterRow = ConsignmentDoc & { retailers: Retailer };

export interface ChallanRow {
  number: string;
  status: "issued" | "cancelled";
}

export function toB2bInvoice(row: RetailRegisterRow, gstin: string): B2bInvoice {
  const inv = buildRetailInvoice({ doc: row, retailer: row.retailers, gstin, challanNumbers: [] });
  const t = inv.totals;
  return {
    docId: row.id,
    invoiceNumber: row.number as string,
    invoiceDate: row.doc_date,
    retailerName: inv.buyer.legalName,
    retailerGstin: inv.buyer.gstin,
    placeOfSupply: inv.placeOfSupply,
    mode: inv.mode,
    ratePercent: GST_RATE_PERCENT,
    status: row.status === "cancelled" ? "cancelled" : "valid",
    amounts: { taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise },
    lines: inv.lines.map((l) => ({
      hsn: l.hsn,
      quantity: l.quantity,
      taxablePaise: l.taxablePaise,
      cgstPaise: l.cgstPaise,
      sgstPaise: l.sgstPaise,
      igstPaise: l.igstPaise,
      valuePaise: l.amountPaise,
    })),
  };
}
