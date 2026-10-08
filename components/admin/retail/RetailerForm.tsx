"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { validateGstin } from "@/lib/retail/gstin";
import type { Retailer } from "@/lib/retail/types";

export function RetailerForm({ initial, submitLabel, onSubmit }: { initial?: Retailer; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [values, setValues] = useState({
    legal_name: initial?.legal_name ?? "",
    trade_name: initial?.trade_name ?? "",
    gstin: initial?.gstin ?? "",
    address: initial?.address ?? "",
    contact_name: initial?.contact_name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    our_share_pct: String(initial?.our_share_pct ?? 75),
  });
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const gstin = values.gstin.trim() ? validateGstin(values.gstin) : null;
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...values, our_share_pct: Number(values.our_share_pct), active });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof values, label: string, props: Record<string, unknown> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`retailer-${key}`}>{label}</Label>
      <Input id={`retailer-${key}`} value={values[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-3 pt-2">
      {field("legal_name", "Legal name", { required: true, maxLength: 200 })}
      {field("trade_name", "Shop name (if different)", { maxLength: 200 })}
      <div className="grid gap-1.5">
        <Label htmlFor="retailer-gstin">GSTIN</Label>
        <Input id="retailer-gstin" value={values.gstin} onChange={set("gstin")} required autoCapitalize="characters" maxLength={20} />
        {gstin && (
          <p className={`text-xs ${gstin.ok ? "text-cb-muted-fg" : "text-red-700"}`}>
            {gstin.ok ? `${gstin.stateName} (${gstin.stateCode})` : gstin.error}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="retailer-address">Address</Label>
        <Textarea id="retailer-address" value={values.address} onChange={set("address")} required maxLength={500} rows={3} />
      </div>
      {field("contact_name", "Contact person", { maxLength: 100 })}
      {field("phone", "Phone", { inputMode: "tel", maxLength: 20 })}
      {field("email", "Email (invoices go here)", { type: "email", maxLength: 200 })}
      {field("our_share_pct", "Our share (%)", { type: "number", inputMode: "decimal", min: 1, max: 99, step: 0.01, required: true })}
      <div className="flex items-center justify-between">
        <Label htmlFor="retailer-active">Active (can receive stock)</Label>
        <Switch id="retailer-active" checked={active} onCheckedChange={setActive} />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={saving || (gstin !== null && !gstin.ok)}>{saving ? "Saving…" : submitLabel}</Button>
    </form>
  );
}
