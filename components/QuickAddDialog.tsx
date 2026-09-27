"use client";

import { useId, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SupabaseImage from "@/components/ui/supabase-image";
import DiscountedPrice from "@/components/discounted-price";
import { images } from "@/app/assets/images";
import {
  cartEditOutcome,
  diffCartDraft,
  pickSize,
  quantityInDraft,
  sizeKey,
  stepSize,
  type CartChange,
  type CartEditOutcome,
  type SizeCounts,
  type SizeOption,
} from "@/lib/utils/cart-edit";

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productImage?: string;
  productColor?: string;
  addOptions: SizeOption[];
  /** This product's lines in the cart, per size (`cartCountsFor`). With any, the picker edits them. */
  cartCounts?: SizeCounts;
  /** Called only when something changed. */
  onConfirm: (changes: CartChange[], outcome: Exclude<CartEditOutcome, "none">) => void;
}

const NOTHING_IN_CART: SizeCounts = {};

const BUTTON_TONES = {
  idle: "bg-cb-peach text-white/90 cursor-not-allowed",
  primary: "bg-cb-terracotta hover:bg-cb-terracotta-deep text-white",
  danger: "bg-red-700 hover:bg-red-800 text-white",
  quiet: "border border-cb-border bg-white text-cb-fg hover:bg-cb-muted",
};

export default function QuickAddDialog({
  open,
  onOpenChange,
  productName,
  productImage,
  productColor,
  addOptions,
  cartCounts = NOTHING_IN_CART,
  onConfirm,
}: QuickAddDialogProps) {
  const badgeId = useId();
  const [selected, setSelected] = useState<string | undefined>(undefined);
  // Only the counts the shopper changed; every other size keeps its cart count.
  const [draft, setDraft] = useState<SizeCounts>({});
  // The cart as it was on opening. A save lands while the dialog animates out, and the live
  // counts would flip the title and button under the shopper's finger.
  const [counts, setCounts] = useState<SizeCounts>(NOTHING_IN_CART);
  const [wasOpen, setWasOpen] = useState(false);

  const hasSizes = addOptions.some((o) => o.size);
  const stockOf = (key: string) => addOptions.find((o) => sizeKey(o.size) === key)?.stock ?? 0;

  // Each opening starts from the cart: on the size already in it, else on no size.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const first = addOptions.find((o) => (cartCounts[sizeKey(o.size)] ?? 0) > 0);
      const initial = first ? sizeKey(first.size) : hasSizes ? undefined : "";
      const nothingInCart = !Object.values(cartCounts).some((n) => n > 0);
      setCounts(cartCounts);
      setSelected(initial);
      setDraft(initial === "" && nothingInCart ? pickSize(cartCounts, {}, "", stockOf("")) : {});
    }
  }

  const inCart = Object.values(counts).some((n) => n > 0);

  const selectedOption = addOptions.find((o) => sizeKey(o.size) === selected);
  const unitPrice = selectedOption?.price ?? addOptions[0]?.price ?? 0;
  const stock = selectedOption?.stock ?? 0;
  const qty = selected === undefined ? 1 : quantityInDraft(counts, draft, selected);
  const inCartNow = selected === undefined ? 0 : counts[selected] ?? 0;
  const minQty = inCart ? 0 : 1;

  const order = addOptions.map((o) => sizeKey(o.size));
  const changes = diffCartDraft(counts, draft).sort(
    (a, b) => order.indexOf(a.size) - order.indexOf(b.size)
  );
  const outcome = cartEditOutcome(counts, draft);
  const newTotal = addOptions.reduce(
    (sum, o) => sum + quantityInDraft(counts, draft, sizeKey(o.size)) * o.price,
    0
  );
  const money = `₹${newTotal.toLocaleString("en-IN")}`;

  const button =
    selected === undefined && !inCart
      ? { label: "Select a size", tone: "idle" as const }
      : outcome === "none"
        ? { label: "Done", tone: "quiet" as const }
        : outcome === "removed"
          ? { label: "Remove from cart", tone: "danger" as const }
          : { label: `${outcome === "added" ? "Add" : "Update cart"} · ${money}`, tone: "primary" as const };

  const choose = (key: string) => {
    setDraft((d) => pickSize(counts, d, key, stockOf(key)));
    setSelected(key);
  };

  const step = (delta: 1 | -1) => {
    if (selected === undefined) return;
    setDraft((d) => stepSize(counts, d, selected, delta, stock));
  };

  const handleConfirm = () => {
    if (button.tone === "idle") return;
    if (outcome !== "none") onConfirm(changes, outcome);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-2xl p-6"
        aria-describedby={undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{inCart ? "Edit cart" : "Add to cart"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="h-[72px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-cb-linen">
            <SupabaseImage
              src={productImage ?? images.staticProductImage}
              alt={productName}
              preset="thumbnail"
              width={60}
              height={72}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-cb-fg">{productName}</p>
            {productColor && (
              <p className="text-sm text-cb-muted-fg">{productColor}</p>
            )}
            <DiscountedPrice price={unitPrice} className="mt-1" />
          </div>
        </div>

        {hasSizes && (
          <div>
            <p className="mb-2 font-semibold text-cb-fg">Select age / size</p>
            <div className="flex flex-wrap gap-2">
              {addOptions.map((o) => {
                const key = sizeKey(o.size);
                const count = quantityInDraft(counts, draft, key);
                const showBadge = inCart && count > 0;
                // The badge is read as the chip's description, so the chip's name stays the size.
                const descriptionId = `${badgeId}-${key}`;
                return (
                  <span key={key} className="contents">
                    <button
                      type="button"
                      onClick={() => choose(key)}
                      aria-pressed={selected === key}
                      aria-describedby={showBadge ? descriptionId : undefined}
                      className={`relative rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        selected === key
                          ? "border-cb-terracotta bg-cb-peach text-cb-terracotta-deep"
                          : "border-cb-border text-cb-fg hover:border-cb-terracotta"
                      }`}
                    >
                      {o.size}
                      {showBadge && (
                        <span
                          aria-hidden="true"
                          className="absolute -right-2 -top-2 h-[22px] min-w-[22px] rounded-full border-2 border-white bg-cb-terracotta-deep px-1 text-[11px] font-bold leading-[18px] text-white"
                        >
                          {count}
                        </span>
                      )}
                    </button>
                    {showBadge && <span id={descriptionId} hidden>{count} in cart</span>}
                  </span>
                );
              })}
            </div>
            {inCart && (
              <p className="mt-2 text-xs text-cb-muted-fg">
                The number on a size is how many will be in your cart.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-cb-fg">Quantity</p>
            {inCartNow > 0 && (
              <p className={`text-sm font-medium ${qty === 0 ? "text-red-700" : "text-cb-muted-fg"}`}>
                {qty === 0 ? "Will be removed" : `In cart now: ${inCartNow}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-full border border-cb-border px-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={selected === undefined || qty <= minQty}
              className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <output aria-label="Quantity" className="w-4 text-center font-semibold tabular-nums">{qty}</output>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={selected === undefined || qty >= stock}
              className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {inCart && hasSizes && changes.length > 0 && (
          <div className="rounded-xl bg-cb-linen px-4 py-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-cb-muted-fg">Changes</p>
            <ul className="space-y-1 text-sm">
              {changes.map((c) => (
                <li key={c.size} className="flex justify-between">
                  <span className="font-semibold text-cb-fg">{c.size}</span>
                  {c.kind === "remove" ? (
                    <span className="font-semibold text-red-700">Remove</span>
                  ) : c.kind === "add" ? (
                    <span className="font-semibold text-cb-success">Add {c.quantity}</span>
                  ) : (
                    <span className="font-semibold text-cb-fg">{c.from} → {c.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          disabled={button.tone === "idle"}
          onClick={handleConfirm}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold transition-colors ${BUTTON_TONES[button.tone]}`}
        >
          {button.tone === "danger" ? (
            <Trash2 className="h-4 w-4" />
          ) : button.tone !== "quiet" ? (
            <ShoppingBag className="h-4 w-4" />
          ) : null}
          {button.label}
        </button>
      </DialogContent>
    </Dialog>
  );
}
