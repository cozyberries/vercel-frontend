"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addSize, createBody, draftFrom, EMPTY_DRAFT, hasChanges, removeNewSize, sizesToAdd, updateBody, type Draft, type DraftSize } from "@/lib/admin/products/form";
import { LIMITS, MAX_STOCK, slugify } from "@/lib/admin/products/rules";
import type { AdminProduct, ProductReference, SaveResult } from "@/lib/admin/products/types";

const SELECT =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

type Props =
  | { mode: "edit"; product: AdminProduct; reference: ProductReference; onSave: (body: ReturnType<typeof updateBody>) => Promise<SaveResult> }
  | { mode: "new"; reference: ProductReference; onCreate: (body: ReturnType<typeof createBody>) => Promise<void> };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-cb-border bg-cb-white p-4">
      <h2 className="font-semibold text-cb-fg">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-cb-muted-fg">{hint}</p>}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

export function ProductForm(props: Props) {
  const { reference } = props;
  const product = props.mode === "edit" ? props.product : null;
  const [draft, setDraft] = useState<Draft>(() => (product ? draftFrom(product) : EMPTY_DRAFT));
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = product ? hasChanges(product, draft) : draft.name.trim() !== "" || draft.sizes.length > 0;

  // Leaving with unsaved stock counts loses a count someone just made; ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setNotice(null);
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "name" && props.mode === "new" && !slugEdited) next.slug = slugify(String(value));
      return next;
    });
  };
  const setSize = (sizeSlug: string, patch: Partial<DraftSize>) => {
    setNotice(null);
    setDraft((d) => ({ ...d, sizes: d.sizes.map((s) => (s.size_slug === sizeSlug ? { ...s, ...patch } : s)) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (props.mode === "edit") {
        const result = await props.onSave(updateBody(props.product, draft));
        setDraft(draftFrom(result.product));
        setNotice(
          result.conflicts.length
            ? `Saved, except ${result.conflicts.map((c) => `${c.size_name} (now ${c.stock_now})`).join(", ")}: that stock changed while you were editing, probably a sale. Check it and save again.`
            : "Saved. The shop shows it in about 10 seconds.",
        );
      } else {
        await props.onCreate(createBody(draft));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addable = sizesToAdd(reference.sizes, draft);
  const sizeOrder = reference.sizes.map((s) => s.slug);

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Section title="Sizes, price and stock" hint="Price is what the customer pays, GST included. Stock is the count at the stall and at home together.">
        {draft.sizes.length === 0 && <p className="text-sm text-cb-muted-fg">No sizes yet. Add one below.</p>}
        <ul className="grid gap-3">
          {draft.sizes.map((s) => {
            const changed = s.start && s.stock !== s.start.stock;
            return (
              <li key={s.size_slug} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-12 shrink-0 font-semibold text-cb-fg">{s.size_name}</span>
                <label className="flex items-center gap-1 text-sm text-cb-muted-fg">
                  ₹
                  <Input
                    aria-label={`${s.size_name} price`}
                    inputMode="numeric"
                    value={s.price}
                    onChange={(e) => setSize(s.size_slug, { price: e.target.value.replace(/[^\d]/g, "") })}
                    className="h-11 w-20"
                    required
                  />
                </label>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-full"
                    aria-label={`One less ${s.size_name}`}
                    disabled={s.stock <= 0}
                    onClick={() => setSize(s.size_slug, { stock: Math.max(0, s.stock - 1) })}
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </Button>
                  <Input
                    aria-label={`${s.size_name} stock`}
                    inputMode="numeric"
                    value={String(s.stock)}
                    onChange={(e) => setSize(s.size_slug, { stock: Math.min(MAX_STOCK, Number(e.target.value.replace(/[^\d]/g, "") || 0)) })}
                    className="h-11 w-14 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-full"
                    aria-label={`One more ${s.size_name}`}
                    onClick={() => setSize(s.size_slug, { stock: Math.min(MAX_STOCK, s.stock + 1) })}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                  {!s.slug && (
                    <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Don't add ${s.size_name}`} onClick={() => setDraft((d) => removeNewSize(d, s.size_slug))}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
                {changed && <span className="w-full text-right text-xs text-cb-muted-fg">was {s.start!.stock}</span>}
                {!s.slug && <span className="w-full text-xs text-cb-muted-fg">New size, added when you save</span>}
              </li>
            );
          })}
        </ul>
        {addable.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="product-add-size">Add a size</Label>
            <select
              id="product-add-size"
              className={SELECT}
              value=""
              onChange={(e) => {
                const size = addable.find((s) => s.slug === e.target.value);
                if (size) setDraft((d) => addSize(d, size, sizeOrder));
              }}
            >
              <option value="">Choose a size…</option>
              {addable.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>

      <Section title="Details">
        <div className="grid gap-1.5">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={LIMITS.name} />
        </div>
        {props.mode === "new" && (
          <div className="grid gap-1.5">
            <Label htmlFor="product-slug">Web address</Label>
            <Input
              id="product-slug"
              value={draft.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", e.target.value.toLowerCase());
              }}
              autoCapitalize="none"
              maxLength={80}
            />
            <p className="text-xs text-cb-muted-fg">cozyberries.in/products/{draft.slug || "…"} · can&apos;t be changed later</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="product-category">Category</Label>
            <select id="product-category" className={SELECT} value={draft.category_slug} onChange={(e) => set("category_slug", e.target.value)} required>
              <option value="">Choose…</option>
              {reference.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="product-gender">For</Label>
            <select id="product-gender" className={SELECT} value={draft.gender_slug} onChange={(e) => set("gender_slug", e.target.value)} required>
              <option value="">Choose…</option>
              {reference.genders.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {props.mode === "new" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="product-print">Print</Label>
            <select id="product-print" className={SELECT} value={draft.color_slug} onChange={(e) => set("color_slug", e.target.value)} required>
              <option value="">Choose…</option>
              {reference.colors.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-cb-muted-fg">Print: {props.product.color_name ?? "not set"}</p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="product-description">Description</Label>
          <Textarea id="product-description" value={draft.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={LIMITS.description} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-features">Features (one per line)</Label>
          <Textarea id="product-features" value={draft.features} onChange={(e) => set("features", e.target.value)} rows={4} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-care">Care instructions</Label>
          <Textarea id="product-care" value={draft.care_instructions} onChange={(e) => set("care_instructions", e.target.value)} rows={3} maxLength={LIMITS.care} />
        </div>
      </Section>

      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 grid gap-2 border-t border-cb-border bg-cb-cream/95 px-4 py-3 backdrop-blur-sm lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border">
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-cb-fg">
            {notice}
          </p>
        )}
        <Button type="submit" className="h-11 rounded-full" disabled={saving || !dirty}>
          {saving ? "Saving…" : props.mode === "new" ? "Add product" : dirty ? "Save changes" : "No changes"}
        </Button>
      </div>
    </form>
  );
}
