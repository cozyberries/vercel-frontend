"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSheet } from "@/components/admin/kit";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { sendJson } from "@/lib/retail/client";
import { firstOpenDay } from "@/lib/retail/dates";

export function TakeBackSheet({ detail, open, onOpenChange, onDone }: { detail: RetailerDetail; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(detail.today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A draft created by a failed issue is reused on retry, so retries never pile up orphan drafts.
  const [draftId, setDraftId] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { doc_id } = await sendJson<{ doc_id: string }>(`/api/admin/retail/${detail.retailer.id}/docs`, {
        kind: "return",
        ...(draftId ? { doc_id: draftId } : {}),
        doc_date: date,
        lines: detail.holdings.map((h) => ({ variant_slug: h.variantSlug, quantity: Number(qty[h.variantSlug] || 0) })),
      });
      setDraftId(doc_id);
      await sendJson(`/api/admin/retail/docs/${doc_id}`, { action: "issue" });
      setDraftId(null);
      setQty({});
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionSheet open={open} onOpenChange={(o) => { if (!o) setDraftId(null); onOpenChange(o); }} title="Take back" description="Returned pieces go back into your online stock.">
      <div className="grid gap-3 pt-2">
        <div className="grid gap-1.5">
          <Label htmlFor="return-date">Date received</Label>
          <Input id="return-date" type="date" min={firstOpenDay(detail.today)} max={detail.today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ul className="grid gap-2 text-sm">
          {detail.holdings.map((h) => (
            <li key={h.variantSlug} className="flex items-center justify-between gap-2">
              <span>{h.productName} ({h.size}) · holds {h.held}</span>
              <Input type="number" min={0} max={h.held} className="w-20" value={qty[h.variantSlug] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [h.variantSlug]: e.target.value }))} aria-label={`Returning ${h.productName} ${h.size}`} />
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button disabled={busy || !Object.values(qty).some((v) => Number(v) > 0)} onClick={() => void submit()}>Take back</Button>
      </div>
    </ActionSheet>
  );
}
