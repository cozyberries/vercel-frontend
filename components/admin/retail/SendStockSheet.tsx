"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSheet } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import type { VariantOption } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";

type Pick = { option: VariantOption; quantity: string; mrp: string };

export function SendStockSheet({ retailerId, today, open, onOpenChange, onDone }: { retailerId: string; today: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const variants = useQuery({ queryKey: ["admin", "retail", "variants"], queryFn: () => retailFetch<{ variants: VariantOption[] }>("/api/admin/retail/variants"), enabled: open, staleTime: 30_000 });
  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = variants.data?.variants ?? [];
    return (q ? list.filter((v) => `${v.productName} ${v.size}`.toLowerCase().includes(q)) : list).slice(0, 30);
  }, [search, variants.data]);

  const add = (option: VariantOption) => {
    if (picks.some((p) => p.option.slug === option.slug)) return;
    setPicks((p) => [...p, { option, quantity: "1", mrp: String(option.pricePaise / 100) }]);
  };
  const update = (slug: string, patch: Partial<Pick>) => setPicks((p) => p.map((x) => (x.option.slug === slug ? { ...x, ...patch } : x)));

  const submit = async (issue: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { doc_id } = await sendJson<{ doc_id: string }>(`/api/admin/retail/${retailerId}/docs`, {
        kind: "challan",
        doc_date: date,
        lines: picks.map((p) => ({ variant_slug: p.option.slug, quantity: Number(p.quantity), mrp_paise: Math.round(Number(p.mrp) * 100) })),
      });
      if (issue) await sendJson(`/api/admin/retail/docs/${doc_id}`, { action: "issue" });
      setPicks([]);
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
    <ActionSheet open={open} onOpenChange={onOpenChange} title="Send stock" description="Pieces leave your online stock when the challan is issued.">
      <div className="grid gap-3 pt-2">
        <div className="grid gap-1.5">
          <Label htmlFor="send-date">Date sent</Label>
          <Input id="send-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {matches.map((v) => (
            <li key={v.slug}>
              <button type="button" className="w-full rounded-lg px-2 py-1 text-left hover:bg-cb-muted" onClick={() => add(v)}>
                {v.productName} ({v.size}) · {v.stock} in stock · {formatPaise(v.pricePaise)}
              </button>
            </li>
          ))}
        </ul>
        {picks.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {picks.map((p) => (
              <li key={p.option.slug} className="grid grid-cols-[1fr_4rem_6rem_auto] items-center gap-2">
                <span>{p.option.productName} ({p.option.size})</span>
                <Input type="number" min={1} max={p.option.stock} value={p.quantity} onChange={(e) => update(p.option.slug, { quantity: e.target.value })} aria-label={`Quantity ${p.option.productName} ${p.option.size}`} />
                <Input type="number" min={1} step={0.01} value={p.mrp} onChange={(e) => update(p.option.slug, { mrp: e.target.value })} aria-label={`MRP ${p.option.productName} ${p.option.size}`} />
                <Button size="sm" variant="ghost" onClick={() => setPicks((x) => x.filter((y) => y.option.slug !== p.option.slug))}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={busy || picks.length === 0} onClick={() => void submit(true)}>Issue challan</Button>
          <Button variant="outline" disabled={busy || picks.length === 0} onClick={() => void submit(false)}>Save draft</Button>
        </div>
      </div>
    </ActionSheet>
  );
}
