import type { InvoiceDocument } from "./build-invoice";

/** "CozyBerries-Invoice-CB-26-27-0001.pdf", or by order number before an invoice is issued. */
export function invoicePdfFilename(doc: Pick<InvoiceDocument, "invoiceNumber" | "orderNumber">): string {
  return doc.invoiceNumber
    ? `CozyBerries-Invoice-${doc.invoiceNumber.replace(/\//g, "-")}.pdf`
    : `CozyBerries-Order-${doc.orderNumber}.pdf`;
}
