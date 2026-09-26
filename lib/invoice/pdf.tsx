import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { InvoiceDocument } from "./build-invoice";

/**
 * The bill as a PDF file, sent to customers on WhatsApp through /bill links.
 * Same content and status wording as the web invoice (app/orders/[id]/invoice).
 * Amounts use "Rs." because the built-in PDF fonts have no ₹ glyph.
 */
// Break lines between words only: no mid-word hyphenation in names and addresses.
Font.registerHyphenationCallback((word) => [word]);

const rs = (paise: number) =>
  "Rs. " + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

const HEADING: Record<InvoiceDocument["status"], (doc: InvoiceDocument) => string> = {
  issued: () => "TAX INVOICE",
  pending: () => "ORDER SUMMARY",
  receipt: () => "PAYMENT RECEIPT",
  cancelled: (doc) => (doc.invoiceNumber ? "TAX INVOICE — CANCELLED" : "ORDER SUMMARY — CANCELLED"),
};

const BANNER: Record<InvoiceDocument["status"], string | null> = {
  issued: null,
  pending: "Order summary — the tax invoice is issued once your payment is confirmed.",
  receipt: "This order was paid before online tax invoices were introduced. Message us on WhatsApp if you need a GST invoice.",
  cancelled: "This order was cancelled or refunded.",
};

const FOOTER: Record<InvoiceDocument["status"], string> = {
  issued: "Prices are inclusive of GST. This is a computer-generated invoice and needs no signature.",
  pending: "Prices are inclusive of GST. This order summary is not a tax invoice.",
  receipt: "Prices are inclusive of GST. This receipt is not a tax invoice.",
  cancelled: "This document has been cancelled.",
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  seller: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#9a3412" },
  heading: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  right: { textAlign: "right" },
  muted: { color: "#6b7280" },
  bold: { fontFamily: "Helvetica-Bold" },
  banner: { marginBottom: 12, padding: 8, borderRadius: 4, backgroundColor: "#fef3c7", color: "#78350f" },
  bannerCancelled: { backgroundColor: "#fee2e2", color: "#7f1d1d" },
  bannerReceipt: { backgroundColor: "#f3f4f6", color: "#374151" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 10 },
  label: { fontSize: 7, color: "#9ca3af", textTransform: "uppercase", marginBottom: 2, fontFamily: "Helvetica-Bold" },
  col: { width: "32%" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingVertical: 4, color: "#6b7280", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", paddingVertical: 5 },
  cItem: { width: "34%", paddingRight: 8 },
  cHsn: { width: "8%" },
  cQty: { width: "6%", textAlign: "right" },
  cNum: { width: "13%", textAlign: "right" },
  cIgst: { width: "26%", textAlign: "right" },
  totals: { marginLeft: "auto", width: "45%", marginTop: 10 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 4, marginTop: 2, fontFamily: "Helvetica-Bold", fontSize: 11 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#9ca3af" },
});

function InvoicePdf({ doc }: { doc: InvoiceDocument }) {
  const intra = doc.mode === "intra";
  const banner = BANNER[doc.status];
  const bannerStyle =
    doc.status === "cancelled" ? [s.banner, s.bannerCancelled] : doc.status === "receipt" ? [s.banner, s.bannerReceipt] : [s.banner];

  return (
    <Document title={`CozyBerries ${doc.invoiceNumber ?? doc.orderNumber}`} author={doc.seller.legalName}>
      <Page size="A4" style={s.page}>
        {banner && <Text style={bannerStyle}>{banner}</Text>}

        <View style={s.row}>
          <View>
            <Text style={s.seller}>{doc.seller.legalName}</Text>
            {doc.seller.addressLines.map((line) => (
              <Text key={line} style={s.muted}>{line}</Text>
            ))}
            <Text style={s.muted}>State: {doc.seller.stateName} ({doc.seller.stateCode})</Text>
            <Text style={s.bold}>GSTIN: {doc.seller.gstin}</Text>
          </View>
          <View>
            <Text style={s.heading}>{HEADING[doc.status](doc)}</Text>
            {doc.invoiceNumber && (
              <Text style={s.right}>Invoice No: <Text style={s.bold}>{doc.invoiceNumber}</Text></Text>
            )}
            {doc.status === "issued" && <Text style={s.right}>Invoice date: {date(doc.invoiceDate)}</Text>}
            <Text style={[s.muted, s.right]}>Order: {doc.orderNumber}</Text>
            <Text style={[s.muted, s.right]}>Order date: {date(doc.orderDate)}</Text>
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.bold}>{doc.buyer.name}</Text>
            {doc.buyer.phone && <Text style={s.muted}>+91 {doc.buyer.phone}</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Ship to</Text>
            {doc.shipTo.kind === "pickup" ? (
              <Text style={s.muted}>{doc.shipTo.label}</Text>
            ) : (
              doc.shipTo.lines.map((line) => <Text key={line} style={s.muted}>{line}</Text>)
            )}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.muted}>
              {doc.placeOfSupply.name}
              {doc.placeOfSupply.code ? ` (${doc.placeOfSupply.code})` : ""}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={s.cItem}>Item</Text>
            <Text style={s.cHsn}>HSN</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cNum}>Taxable</Text>
            {intra ? (
              <>
                <Text style={s.cNum}>CGST 2.5%</Text>
                <Text style={s.cNum}>SGST 2.5%</Text>
              </>
            ) : (
              <Text style={s.cIgst}>IGST 5%</Text>
            )}
            <Text style={s.cNum}>Amount</Text>
          </View>
          {doc.lines.map((line, idx) => (
            <View key={`${line.description}-${idx}`} style={s.tr} wrap={false}>
              <Text style={s.cItem}>{line.description}</Text>
              <Text style={s.cHsn}>{line.hsn}</Text>
              <Text style={s.cQty}>{line.quantity}</Text>
              <Text style={s.cNum}>{rs(line.taxablePaise)}</Text>
              {intra ? (
                <>
                  <Text style={s.cNum}>{rs(line.cgstPaise)}</Text>
                  <Text style={s.cNum}>{rs(line.sgstPaise)}</Text>
                </>
              ) : (
                <Text style={s.cIgst}>{rs(line.igstPaise)}</Text>
              )}
              <Text style={[s.cNum, s.bold]}>{rs(line.amountPaise)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          {doc.totals.discountPaise > 0 && (
            <View style={s.tline}>
              <Text style={s.muted}>Discount (included in amounts)</Text>
              <Text>- {rs(doc.totals.discountPaise)}</Text>
            </View>
          )}
          <View style={s.tline}>
            <Text style={s.muted}>Taxable value</Text>
            <Text>{rs(doc.totals.taxablePaise)}</Text>
          </View>
          {intra ? (
            <>
              <View style={s.tline}>
                <Text style={s.muted}>CGST</Text>
                <Text>{rs(doc.totals.cgstPaise)}</Text>
              </View>
              <View style={s.tline}>
                <Text style={s.muted}>SGST</Text>
                <Text>{rs(doc.totals.sgstPaise)}</Text>
              </View>
            </>
          ) : (
            <View style={s.tline}>
              <Text style={s.muted}>IGST</Text>
              <Text>{rs(doc.totals.igstPaise)}</Text>
            </View>
          )}
          <View style={s.grand}>
            <Text>Total</Text>
            <Text>{rs(doc.totals.totalPaise)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 16 }} wrap={false}>
          <Text>
            <Text style={s.muted}>Amount in words: </Text>
            {doc.amountInWords}
          </Text>
          {doc.paymentMethod && (
            <Text style={{ marginTop: 3 }}>
              <Text style={s.muted}>Paid by: </Text>
              {doc.paymentMethod}
            </Text>
          )}
        </View>

        <Text style={s.footer} fixed>{FOOTER[doc.status]}</Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf doc={doc} />);
}
