"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Printer } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import type { InvoiceDocument } from "@/lib/invoice/build-invoice";

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

export default function InvoicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push(`/login?redirect=/orders/${orderId}/invoice`);
      return;
    }
    if (user && orderId) {
      fetch(`/api/orders/${orderId}/invoice`)
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body?.error || "Failed to load invoice");
          setInvoice(body.invoice);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [user, loading, orderId, router]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cb-terracotta" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-cb-muted-fg mb-4">{error || "Invoice not found"}</p>
          <Link href="/orders" className="text-cb-terracotta-deep font-semibold hover:underline">
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  const issued = invoice.status === "issued";
  const intra = invoice.mode === "intra";

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-cb-border bg-cb-linen px-4 py-3">
        <Link href={`/orders/${orderId}`} className="text-sm font-semibold text-cb-fg">
          ← Back to order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full bg-cb-terracotta px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-8 py-8 text-gray-900">
        {!issued && (
          <p className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            Order summary — the tax invoice is issued once your payment is confirmed.
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold">{invoice.seller.legalName}</h1>
            <p className="text-sm text-gray-600">Trade name: {invoice.seller.tradeName}</p>
            {invoice.seller.addressLines.map((l) => (
              <p key={l} className="text-sm text-gray-600">{l}</p>
            ))}
            <p className="text-sm text-gray-600">State: {invoice.seller.stateName} ({invoice.seller.stateCode})</p>
            <p className="text-sm font-semibold">GSTIN: {invoice.seller.gstin}</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold">{issued ? "TAX INVOICE" : "ORDER SUMMARY"}</h2>
            {issued && <p className="text-sm">Invoice No: <span className="font-semibold">{invoice.invoiceNumber}</span></p>}
            {issued && <p className="text-sm">Invoice date: {date(invoice.invoiceDate)}</p>}
            <p className="text-sm text-gray-600">Order: {invoice.orderNumber}</p>
            <p className="text-sm text-gray-600">Order date: {date(invoice.orderDate)}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Bill to</p>
            <p className="font-semibold">{invoice.buyer.name}</p>
            {invoice.buyer.phone && <p className="text-gray-600">+91 {invoice.buyer.phone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Ship to</p>
            {invoice.shipTo.kind === "pickup" ? (
              <p className="text-gray-600">{invoice.shipTo.label}</p>
            ) : (
              invoice.shipTo.lines.map((l) => <p key={l} className="text-gray-600">{l}</p>)
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Place of supply</p>
            <p className="text-gray-600">
              {invoice.placeOfSupply.name}
              {invoice.placeOfSupply.code ? ` (${invoice.placeOfSupply.code})` : ""}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-500">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 px-2 font-medium">HSN</th>
                <th className="py-2 px-2 font-medium text-right">Qty</th>
                <th className="py-2 px-2 font-medium text-right">Taxable</th>
                {intra ? (
                  <>
                    <th className="py-2 px-2 font-medium text-right">CGST 2.5%</th>
                    <th className="py-2 px-2 font-medium text-right">SGST 2.5%</th>
                  </>
                ) : (
                  <th className="py-2 px-2 font-medium text-right">IGST 5%</th>
                )}
                <th className="py-2 pl-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, idx) => (
                <tr key={`${line.description}-${idx}`} className="border-b border-gray-100">
                  <td className="py-2 pr-2">{line.description}</td>
                  <td className="py-2 px-2 text-gray-600">{line.hsn}</td>
                  <td className="py-2 px-2 text-right text-gray-600">{line.quantity}</td>
                  <td className="py-2 px-2 text-right">{rupees(line.taxablePaise)}</td>
                  {intra ? (
                    <>
                      <td className="py-2 px-2 text-right">{rupees(line.cgstPaise)}</td>
                      <td className="py-2 px-2 text-right">{rupees(line.sgstPaise)}</td>
                    </>
                  ) : (
                    <td className="py-2 px-2 text-right">{rupees(line.igstPaise)}</td>
                  )}
                  <td className="py-2 pl-2 text-right font-medium">{rupees(line.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-6">
          <div className="w-64 space-y-1.5 text-sm">
            {invoice.totals.discountPaise > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount (included above)</span>
                <span>−{rupees(invoice.totals.discountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Taxable value</span><span>{rupees(invoice.totals.taxablePaise)}</span></div>
            {intra ? (
              <>
                <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{rupees(invoice.totals.cgstPaise)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{rupees(invoice.totals.sgstPaise)}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{rupees(invoice.totals.igstPaise)}</span></div>
            )}
            <div className="flex justify-between border-t border-gray-300 pt-1.5 font-bold">
              <span>Total</span>
              <span>{rupees(invoice.totals.totalPaise)}</span>
            </div>
          </div>
        </div>

        <p className="text-sm mb-1"><span className="text-gray-500">Amount in words:</span> {invoice.amountInWords}</p>
        {invoice.paymentMethod && (
          <p className="text-sm mb-6"><span className="text-gray-500">Paid by:</span> {invoice.paymentMethod}</p>
        )}
        <p className="text-center text-xs text-gray-400 mt-10">
          Prices are inclusive of GST. This is a computer-generated invoice and needs no signature.
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
