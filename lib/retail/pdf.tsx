import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDay } from "./dates";
import type { ChallanDocument, Party, RetailInvoiceDocument } from "./documents";

/**
 * Server-only. Shop invoice and delivery challan PDFs, emailed by the owner.
 * "Rs." because the built-in PDF fonts have no ₹ glyph (same as lib/invoice/pdf.tsx).
 */
Font.registerHyphenationCallback((word) => [word]);

const rs = (paise: number) => "Rs. " + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  seller: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#9a3412" },
  heading: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  right: { textAlign: "right" },
  muted: { color: "#6b7280" },
  bold: { fontFamily: "Helvetica-Bold" },
  cancelled: { marginBottom: 12, padding: 8, borderRadius: 4, backgroundColor: "#fee2e2", color: "#7f1d1d" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 10 },
  label: { fontSize: 7, color: "#9ca3af", textTransform: "uppercase", marginBottom: 2, fontFamily: "Helvetica-Bold" },
  half: { width: "48%" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingVertical: 4, color: "#6b7280", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", paddingVertical: 5 },
  cItem: { width: "30%", paddingRight: 8 },
  cHsn: { width: "8%" },
  cQty: { width: "6%", textAlign: "right" },
  cNum: { width: "11%", textAlign: "right" },
  cWide: { width: "22%", textAlign: "right" },
  totals: { marginLeft: "auto", width: "45%", marginTop: 10 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 4, marginTop: 2, fontFamily: "Helvetica-Bold", fontSize: 11 },
  note: { marginTop: 14 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#9ca3af" },
});

function SellerBlock({ seller }: { seller: Party }) {
  return (
    <View>
      <Text style={s.seller}>{seller.legalName}</Text>
      {seller.addressLines.map((l) => <Text key={l} style={s.muted}>{l}</Text>)}
      <Text style={s.muted}>State: {seller.stateName} ({seller.stateCode})</Text>
      <Text style={s.bold}>GSTIN: {seller.gstin}</Text>
    </View>
  );
}

function PartyBlock({ label, party }: { label: string; party: Party }) {
  return (
    <View style={s.half}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.bold}>{party.legalName}</Text>
      {party.tradeName && party.tradeName !== party.legalName && <Text style={s.muted}>({party.tradeName})</Text>}
      {party.addressLines.map((l) => <Text key={l} style={s.muted}>{l}</Text>)}
      <Text style={s.muted}>State: {party.stateName} ({party.stateCode})</Text>
      <Text style={s.bold}>GSTIN: {party.gstin}</Text>
    </View>
  );
}

function RetailInvoicePdf({ doc }: { doc: RetailInvoiceDocument }) {
  const intra = doc.mode === "intra";
  return (
    <Document title={`CozyBerries ${doc.number ?? "draft invoice"}`} author={doc.seller.legalName}>
      <Page size="A4" style={s.page}>
        {doc.status === "cancelled" && <Text style={s.cancelled}>This invoice has been cancelled.</Text>}
        <View style={s.row}>
          <SellerBlock seller={doc.seller} />
          <View>
            <Text style={s.heading}>{doc.status === "draft" ? "DRAFT — NOT A TAX INVOICE" : "TAX INVOICE"}</Text>
            {doc.number && <Text style={s.right}>Invoice No: <Text style={s.bold}>{doc.number}</Text></Text>}
            <Text style={s.right}>Invoice date: {formatDay(doc.date)}</Text>
            <Text style={[s.muted, s.right]}>Sales for {doc.period}</Text>
          </View>
        </View>
        <View style={s.rule} />
        <View style={s.row}>
          <PartyBlock label="Bill to" party={doc.buyer} />
          <View style={s.half}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.muted}>{doc.placeOfSupply.name} ({doc.placeOfSupply.code})</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Reverse charge</Text>
            <Text style={s.muted}>No</Text>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={s.cItem}>Item</Text>
            <Text style={s.cHsn}>HSN</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cNum}>MRP</Text>
            <Text style={s.cNum}>Rate</Text>
            <Text style={s.cNum}>Taxable</Text>
            {intra ? (
              <>
                <Text style={s.cNum}>CGST 2.5%</Text>
                <Text style={s.cNum}>SGST 2.5%</Text>
              </>
            ) : (
              <Text style={s.cWide}>IGST 5%</Text>
            )}
          </View>
          {doc.lines.map((l, i) => (
            <View key={`${l.description}-${i}`} style={s.tr} wrap={false}>
              <Text style={s.cItem}>{l.description}</Text>
              <Text style={s.cHsn}>{l.hsn}</Text>
              <Text style={s.cQty}>{l.quantity}</Text>
              <Text style={s.cNum}>{rs(l.mrpPaise)}</Text>
              <Text style={s.cNum}>{rs(l.unitPricePaise)}</Text>
              <Text style={s.cNum}>{rs(l.taxablePaise)}</Text>
              {intra ? (
                <>
                  <Text style={s.cNum}>{rs(l.cgstPaise)}</Text>
                  <Text style={s.cNum}>{rs(l.sgstPaise)}</Text>
                </>
              ) : (
                <Text style={s.cWide}>{rs(l.igstPaise)}</Text>
              )}
            </View>
          ))}
        </View>
        <View style={s.totals} wrap={false}>
          <View style={s.tline}><Text style={s.muted}>Total MRP of pieces sold</Text><Text>{rs(doc.totalMrpPaise)}</Text></View>
          <View style={s.tline}><Text style={s.muted}>Taxable value</Text><Text>{rs(doc.totals.taxablePaise)}</Text></View>
          {intra ? (
            <>
              <View style={s.tline}><Text style={s.muted}>CGST</Text><Text>{rs(doc.totals.cgstPaise)}</Text></View>
              <View style={s.tline}><Text style={s.muted}>SGST</Text><Text>{rs(doc.totals.sgstPaise)}</Text></View>
            </>
          ) : (
            <View style={s.tline}><Text style={s.muted}>IGST</Text><Text>{rs(doc.totals.igstPaise)}</Text></View>
          )}
          <View style={s.grand}><Text>Total</Text><Text>{rs(doc.totals.totalPaise)}</Text></View>
        </View>
        <View style={s.note} wrap={false}>
          <Text><Text style={s.muted}>Amount in words: </Text>{doc.amountInWords}</Text>
          <Text style={{ marginTop: 3 }}>
            Supply on sale-or-return basis at {doc.sharePct}% of MRP
            {doc.challanNumbers.length ? `, against challans ${doc.challanNumbers.join(", ")}` : ""}.
          </Text>
        </View>
        <Text style={s.footer} fixed>Rates are inclusive of GST. This is a computer-generated invoice and needs no signature.</Text>
      </Page>
    </Document>
  );
}

function ChallanPdf({ doc }: { doc: ChallanDocument }) {
  return (
    <Document title={`CozyBerries ${doc.number ?? "draft challan"}`} author={doc.seller.legalName}>
      <Page size="A4" style={s.page}>
        {doc.status === "cancelled" && <Text style={s.cancelled}>This challan has been cancelled.</Text>}
        <View style={s.row}>
          <SellerBlock seller={doc.seller} />
          <View>
            <Text style={s.heading}>DELIVERY CHALLAN</Text>
            <Text style={[s.muted, s.right]}>Supply on sale-or-return basis</Text>
            {doc.number && <Text style={s.right}>Challan No: <Text style={s.bold}>{doc.number}</Text></Text>}
            <Text style={s.right}>Date: {formatDay(doc.date)}</Text>
          </View>
        </View>
        <View style={s.rule} />
        <View style={s.row}>
          <PartyBlock label="Consignee" party={doc.consignee} />
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={[s.cItem, { width: "52%" }]}>Item</Text>
            <Text style={s.cHsn}>HSN</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cNum}>MRP</Text>
            <Text style={s.cWide}>Value at MRP</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View key={`${l.description}-${i}`} style={s.tr} wrap={false}>
              <Text style={[s.cItem, { width: "52%" }]}>{l.description}</Text>
              <Text style={s.cHsn}>{l.hsn}</Text>
              <Text style={s.cQty}>{l.quantity}</Text>
              <Text style={s.cNum}>{rs(l.mrpPaise)}</Text>
              <Text style={s.cWide}>{rs(l.valuePaise)}</Text>
            </View>
          ))}
        </View>
        <View style={s.totals} wrap={false}>
          <View style={s.tline}><Text style={s.muted}>Pieces</Text><Text>{doc.totalQuantity}</Text></View>
          <View style={s.grand}><Text>Value at MRP</Text><Text>{rs(doc.totalMrpPaise)}</Text></View>
        </View>
        <Text style={s.note}>Goods remain the property of {doc.seller.legalName} until sold. Not a tax invoice.</Text>
        <Text style={s.footer} fixed>This is a computer-generated challan and needs no signature.</Text>
      </Page>
    </Document>
  );
}

export async function renderRetailInvoicePdf(doc: RetailInvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<RetailInvoicePdf doc={doc} />);
}

export async function renderChallanPdf(doc: ChallanDocument): Promise<Buffer> {
  return renderToBuffer(<ChallanPdf doc={doc} />);
}
