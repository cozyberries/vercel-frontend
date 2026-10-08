"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";

const METHOD = { upi: "UPI", bank: "Bank", cash: "Cash" } as const;

export function PaymentsPanel({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const invoices = detail.docs.filter((d) => d.kind === "sale" && d.status === "issued" && d.number);
  const [form, setForm] = useState({ amount: "", paid_on: detail.today, method: "upi", reference: "", doc_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/admin/retail/${detail.retailer.id}/payments`, {
        amount_paise: Math.round(Number(form.amount) * 100),
        paid_on: form.paid_on,
        method: form.method,
        reference: form.reference,
        doc_id: form.doc_id || null,
      });
      setForm((f) => ({ ...f, amount: "", reference: "" }));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this payment?")) return;
    try {
      await retailFetch(`/api/admin/retail/payments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-3">
      <form onSubmit={submit} className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
        <p className="font-semibold">Record payment</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1"><Label htmlFor="pay-amount">Amount (₹)</Label><Input id="pay-amount" type="number" min={0.01} step={0.01} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="pay-date">Date</Label><Input id="pay-date" type="date" max={detail.today} required value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="pay-method">Method</Label>
            <select id="pay-method" className="h-10 rounded-md border border-cb-border px-2" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="upi">UPI</option><option value="bank">Bank</option><option value="cash">Cash</option>
            </select>
          </div>
          <div className="grid gap-1"><Label htmlFor="pay-ref">Reference</Label><Input id="pay-ref" maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
        </div>
        <div className="grid gap-1"><Label htmlFor="pay-invoice">Against invoice (optional)</Label>
          <select id="pay-invoice" className="h-10 rounded-md border border-cb-border px-2" value={form.doc_id} onChange={(e) => setForm({ ...form, doc_id: e.target.value })}>
            <option value="">—</option>
            {invoices.map((d) => <option key={d.id} value={d.id}>{d.number}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <Button type="submit" size="sm" disabled={busy}>Save payment</Button>
      </form>
      {detail.payments.length === 0 ? <EmptyState title="No payments yet" /> : (
        <ul className="space-y-2">
          {detail.payments.map((p) => (
            <ListCard key={p.id} testId="retail-payment" title={formatDay(p.paid_on)} meta={`${formatPaise(p.amount_paise)} · ${METHOD[p.method]}${p.reference ? ` · ${p.reference}` : ""}`}
              actions={<Button size="sm" variant="ghost" onClick={() => void remove(p.id)}>Delete</Button>} />
          ))}
        </ul>
      )}
    </div>
  );
}
