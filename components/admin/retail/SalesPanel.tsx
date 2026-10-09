"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChips } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay, recentPeriods } from "@/lib/retail/dates";
import { formatRate, priceSaleLines, ratesFor, retailGst } from "@/lib/retail/pricing";
import { docParty, retailPdfFilename } from "@/lib/retail/documents";
import { PdfButtons } from "./PdfButtons";
import type { RowError } from "@/lib/retail/types";

export function SalesPanel({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const { retailer } = detail;
  const periods = useMemo(() => recentPeriods(new Date(`${detail.today}T12:00:00+05:30`), 4), [detail.today]);
  const [month, setMonth] = useState(periods[1]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sale = detail.docs.find((d) => d.kind === "sale" && d.period === month && d.status !== "cancelled");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [newRate, setNewRate] = useState("");
  const rates = ratesFor(detail.discountRates, month);
  const soldRates = [0, ...rates];
  const manualKey = (slug: string, rate: number) => `${slug}|${rate}`;
  const rateLabel = (rate: number) => (rate ? `at ${formatRate(rate)}% off` : "at full MRP");

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    setRowErrors([]);
    try {
      await work();
      onChanged();
    } catch (e) {
      const err = e as Error & { body?: { rowErrors?: RowError[] } };
      setRowErrors(err.body?.rowErrors ?? []);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("month", month);
    form.set("file", file);
    void run(() => retailFetch(`/api/admin/retail/${retailer.id}/sheet`, { method: "POST", body: form }));
  };

  const saveManual = () =>
    void run(() =>
      sendJson(`/api/admin/retail/${retailer.id}/docs`, {
        kind: "sale",
        period: month,
        lines: detail.holdings.flatMap((h) =>
          soldRates.map((rate) => ({ variant_slug: h.variantSlug, quantity: Number(manual[manualKey(h.variantSlug, rate)] || 0), discount_pct: rate })),
        ),
      }),
    );

  const addRate = () =>
    void run(async () => {
      await sendJson(`/api/admin/retail/${retailer.id}/rates`, { period: month, rate_pct: Number(newRate) });
      setNewRate("");
    });

  const removeRate = (rate: number) =>
    void run(() => retailFetch(`/api/admin/retail/${retailer.id}/rates?period=${month}&rate=${rate}`, { method: "DELETE" }));

  const priced = sale ? priceSaleLines(sale.consignment_lines, sale.share_pct ?? retailer.our_share_pct) : [];
  const gst = sale ? retailGst(priced, docParty(sale, retailer).stateCode) : null;

  const issue = (docId: string) => {
    const name = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
    if (!window.confirm(`Issue the invoice for ${name} ${month.slice(0, 4)}? This takes the next invoice number and closes ${name} for this shop.`)) return;
    void run(() => sendJson(`/api/admin/retail/docs/${docId}`, { action: "issue" }));
  };

  return (
    <div className="grid gap-3">
      <FilterChips label="Month" chips={periods.map((p) => ({ value: p, label: monthLabel(p) }))} value={month} onChange={(m) => { setMonth(m); setManual({}); setRowErrors([]); setMessage(null); }} />

      {sale?.status === "issued" ? (
        <section className="rounded-2xl border border-cb-border bg-cb-white p-4">
          <p className="font-semibold">{sale.number ? `Invoice ${sale.number}` : "Nothing sold"}</p>
          <p className="text-sm text-cb-muted-fg">Dated {formatDay(sale.doc_date)}{gst && sale.number ? ` · ${formatPaise(gst.totals.totalPaise)}` : ""}</p>
          {rates.length > 0 && <p className="text-sm text-cb-muted-fg">Discounts: {rates.map((r) => `${formatRate(r)}%`).join(", ")}</p>}
          {sale.number && <div className="mt-2"><PdfButtons docId={sale.id} fileName={retailPdfFilename(sale)} /></div>}
        </section>
      ) : (
        <>
          <section className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4">
            <p className="text-sm font-semibold">Discounts for {monthLabel(month)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {rates.length === 0 && <span className="text-sm text-cb-muted-fg">None: everything sells at full MRP.</span>}
              {rates.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full border border-cb-border px-3 py-1 text-sm">
                  <span>{formatRate(r)}% off</span>
                  <button type="button" aria-label={`Remove ${formatRate(r)}% off`} disabled={busy} onClick={() => removeRate(r)} className="ml-1 text-cb-muted-fg hover:text-red-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="rate-input" className="sr-only">New discount %</Label>
              <Input id="rate-input" type="number" inputMode="decimal" min={0.01} max={99.99} step={0.01} placeholder="%" className="w-24"
                value={newRate} onChange={(e) => setNewRate(e.target.value)} />
              <Button size="sm" variant="outline" disabled={busy || newRate.trim() === ""} onClick={addRate}>Add discount</Button>
            </div>
            {rates.length > 0 && <p className="text-xs text-cb-muted-fg">Download the sheet again after changing discounts.</p>}
          </section>

          <section className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4">
            <p className="text-sm">Send the shop this month&apos;s sheet, then upload it once filled.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline"><a href={`/api/admin/retail/${retailer.id}/sheet?month=${month}`}>Download sheet</a></Button>
              <Label htmlFor="sheet-upload" className="sr-only">Upload filled sheet</Label>
              <Input id="sheet-upload" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={upload} disabled={busy} className="max-w-xs" />
            </div>
          </section>

          {(message || rowErrors.length > 0) && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {message && <p className="font-semibold">{message}</p>}
              <ul className="mt-1 list-disc pl-5">
                {rowErrors.map((r) => <li key={`${r.row}-${r.code}`}>Row {r.row}: {r.message}</li>)}
              </ul>
            </div>
          )}

          {sale && gst ? (
            <section data-testid="sale-preview" className="rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
              <p className="font-semibold">Draft for {monthLabel(month)}</p>
              {priced.length === 0 ? <p>Nothing sold.</p> : (
                <ul className="mt-1 space-y-1">
                  {priced.map((l, i) => (
                    <li key={i}>
                      {l.description} × {l.quantity} · MRP {formatPaise(l.mrpPaise)}
                      {l.discountPct ? ` · ${formatRate(l.discountPct)}% off` : ""} · {formatPaise(l.unitPricePaise)} each
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2">Taxable {formatPaise(gst.totals.taxablePaise)}</p>
              {gst.mode === "intra"
                ? <p>CGST {formatPaise(gst.totals.cgstPaise)} · SGST {formatPaise(gst.totals.sgstPaise)}</p>
                : <p>IGST {formatPaise(gst.totals.igstPaise)}</p>}
              <p className="font-semibold">Total {formatPaise(gst.totals.totalPaise)}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => issue(sale.id)}>Issue invoice</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => sendJson(`/api/admin/retail/docs/${sale.id}`, { action: "cancel" }))}>Discard draft</Button>
              </div>
            </section>
          ) : null}

          <details className="rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Or type the quantities</summary>
            <div className="mt-2 grid gap-2">
              {detail.holdings.map((h) => (
                <div key={h.variantSlug} className="grid gap-1">
                  <span>{h.productName} ({h.size}) · holds {h.held}</span>
                  <div className="flex flex-wrap gap-2">
                    {soldRates.map((rate) => (
                      <label key={rate} className="flex items-center gap-1 text-xs text-cb-muted-fg">
                        {rate ? `${formatRate(rate)}% off` : "Full MRP"}
                        <Input type="number" inputMode="numeric" min={0} max={h.held} className="w-20"
                          value={manual[manualKey(h.variantSlug, rate)] ?? ""}
                          onChange={(e) => setManual((m) => ({ ...m, [manualKey(h.variantSlug, rate)]: e.target.value }))}
                          aria-label={`Sold ${h.productName} ${h.size} ${rateLabel(rate)}`} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" disabled={busy} onClick={saveManual}>Save as draft</Button>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
