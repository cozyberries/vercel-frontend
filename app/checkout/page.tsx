"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SupabaseImage from "@/components/ui/supabase-image";
import {
  ChevronLeft,
  MapPin,
  Home,
  Briefcase,
  Plus,
  Phone,
  Receipt,
  Copy,
  MessageCircle,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import { useCartTotals } from "@/hooks/useCartTotals";
import AddressFormModal from "@/components/profile/AddressFormModal";
import { toast } from "sonner";
import { STATIC_QR_CODE_URL, UPI_ID, UPI_PHONE_NUMBER } from "@/lib/constants";
import { getActiveOffer } from "@/lib/utils/discount";
import type { FulfilmentMethod } from "@/lib/types/order";
import { canContinueCheckout, deliveryChargeFor } from "@/lib/utils/fulfilment";
import { FulfilmentPicker } from "@/components/checkout/FulfilmentPicker";
import { StallCard } from "@/components/checkout/StallCard";

const ADMIN_OVERRIDE_NOTE_MIN_LEN = 3;
const ADMIN_OVERRIDE_NOTE_MAX_LEN = 500;

const TYPE_ICON: Record<string, typeof Home> = {
  home: Home,
  work: Briefcase,
};

type Step = "address" | "payment";

function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cb-terracotta text-xs font-bold text-white">
          {step === "payment" ? <Check className="h-3.5 w-3.5" /> : "1"}
        </span>
        <span className={step === "address" ? "font-semibold text-cb-fg" : "text-cb-muted-fg"}>Address</span>
      </div>
      <span className="h-px w-4 bg-cb-border" />
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            step === "payment" ? "bg-cb-terracotta text-white" : "bg-cb-muted text-cb-muted-fg"
          }`}
        >
          2
        </span>
        <span className={step === "payment" ? "font-semibold text-cb-fg" : "text-cb-muted-fg"}>Payment</span>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const { cart } = useCart();
  const { user, loading, impersonation } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("address");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>("delivery");
  const [adminOverrideEnabled, setAdminOverrideEnabled] = useState(false);
  const [adminOverrideAmount, setAdminOverrideAmount] = useState("");
  const [adminOverrideNote, setAdminOverrideNote] = useState("");

  const {
    profile,
    addresses,
    isLoading: addressesLoading,
    showAddAddress,
    editingAddress,
    addressData,
    addressValidationErrors,
    setShowAddAddress,
    setAddressData,
    handleAddAddress,
    handleUpdateAddress,
    handleCloseAddressModal,
  } = useProfile(user);

  const offer = getActiveOffer();
  const { subtotal, discountAmount: organicDiscount } = useCartTotals(cart, offer);

  const overrideActive = impersonation.active && adminOverrideEnabled;
  const parsedOverrideAmount = (() => {
    const trimmed = adminOverrideAmount.trim();
    if (trimmed.length === 0) return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  })();
  const overrideAmountValid =
    Number.isFinite(parsedOverrideAmount) &&
    Number.isInteger(parsedOverrideAmount) &&
    parsedOverrideAmount >= 0 &&
    parsedOverrideAmount <= subtotal;
  const trimmedOverrideNote = adminOverrideNote.trim();
  const overrideNoteValid =
    trimmedOverrideNote.length >= ADMIN_OVERRIDE_NOTE_MIN_LEN &&
    trimmedOverrideNote.length <= ADMIN_OVERRIDE_NOTE_MAX_LEN;
  const overrideValid = overrideAmountValid && overrideNoteValid;
  const overrideAmountInt = overrideAmountValid ? parsedOverrideAmount : 0;

  const discountAmount = overrideActive ? overrideAmountInt : organicDiscount;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const deliveryCharge = deliveryChargeFor(discountedSubtotal, fulfilment, cart.length);
  const readyToContinue = canContinueCheckout({ fulfilment, selectedAddressId });
  const total = discountedSubtotal + deliveryCharge;

  // Redirect if user is not authenticated; preserve redirect so post-login returns to checkout
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/checkout");
    }
  }, [user, loading, router]);

  // Auto-select default address once addresses load
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((addr) => addr.is_default);
      setSelectedAddressId((defaultAddress ?? addresses[0]).id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

  const handleAddressModalSave = async () => {
    const saved = editingAddress ? await handleUpdateAddress(editingAddress) : await handleAddAddress();
    if (saved) setSelectedAddressId(saved.id);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    }
  };

  const handlePlaceOrder = async () => {
    if (!readyToContinue) {
      toast.error("Please select a delivery address");
      return;
    }
    if (overrideActive && !overrideValid) {
      toast.error("Fix the admin override fields first");
      return;
    }

    setIsPlacingOrder(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            ...(item.size ? { size: item.size } : {}),
            ...(item.color ? { color: item.color } : {}),
          })),
          fulfilment_method: fulfilment,
          ...(fulfilment === "delivery" ? { shipping_address_id: selectedAddressId } : {}),
          ...(overrideActive
            ? { admin_override: { discount_amount: overrideAmountInt, note: trimmedOverrideNote } }
            : offer
              ? { coupon_code: offer.code }
              : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data?.error || "Failed to place order. Please try again.");
        setIsPlacingOrder(false);
        return;
      }

      router.replace(data.payment_url);
    } catch (err) {
      console.error("Order placement error:", err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setIsPlacingOrder(false);
    }
  };

  if (loading || addressesLoading) {
    return (
      <div className="min-h-screen bg-cb-linen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cb-terracotta border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-cb-linen">
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-light text-cb-fg mb-4">Your cart is empty</h1>
          <p className="text-cb-muted-fg mb-8">Add some items to your cart before checking out.</p>
          <Button asChild className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white">
            <Link href="/products">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cb-linen pb-40 lg:pb-28">
      <div className="bg-white border-b border-cb-border">
        <div className="container mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (step === "payment" ? setStep("address") : router.back())}
              aria-label="Back"
              className="text-cb-fg"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-cb-fg">Checkout</h1>
          </div>
          <Stepper step={step} />
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        {step === "address" ? (
          <>
            <div className="bg-white rounded-2xl border border-cb-border p-5">
              <h2 className="text-base font-bold text-cb-fg mb-4">How would you like to get it?</h2>
              <FulfilmentPicker value={fulfilment} onChange={setFulfilment} />
            </div>

            {fulfilment === "delivery" ? (
              <div className="bg-white rounded-2xl border border-cb-border p-5">
                <h2 className="flex items-center gap-2 text-base font-bold text-cb-fg mb-4">
                  <MapPin className="h-4 w-4 text-cb-terracotta-deep" />
                  Delivery address
                </h2>

                <div className="space-y-3">
                  {addresses.map((address) => {
                    const Icon = TYPE_ICON[address.address_type] ?? MapPin;
                    const typeLabel =
                      address.label?.trim() ||
                      (address.address_type === "home" ? "Home" : address.address_type === "work" ? "Work" : "Other");
                    const selected = selectedAddressId === address.id;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => setSelectedAddressId(address.id)}
                        className={`w-full text-left rounded-2xl border p-4 ${
                          selected ? "border-cb-terracotta bg-cb-peach/40" : "border-cb-border bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              selected ? "border-cb-terracotta" : "border-cb-border"
                            }`}
                          >
                            {selected && <span className="h-2 w-2 rounded-full bg-cb-terracotta" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Icon className="h-3.5 w-3.5 text-cb-fg" />
                              <span className="font-bold text-cb-fg">{typeLabel}</span>
                              {address.is_default && (
                                <span className="rounded-full bg-cb-peach px-2 py-0.5 text-[11px] font-bold text-cb-terracotta-deep">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-cb-fg">
                              {address.full_name} · +91 {address.phone}
                            </p>
                            <p className="text-sm text-cb-muted-fg">
                              {[address.address_line_1, address.area].filter(Boolean).join(", ")}, {address.city} –{" "}
                              {address.postal_code}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddAddress(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-cb-border py-3 text-sm font-semibold text-cb-fg"
                >
                  <Plus className="h-4 w-4" />
                  Add new address
                </button>
              </div>
            ) : (
              <StallCard />
            )}

            <OrderSummary
              cart={cart}
              subtotal={subtotal}
              discountAmount={discountAmount}
              deliveryCharge={deliveryCharge}
              total={total}
              offerCode={overrideActive ? null : offer?.code ?? null}
              fulfilment={fulfilment}
              showItems
            />
          </>
        ) : (
          <>
            {fulfilment === "delivery" ? (
              <div className="bg-white rounded-2xl border border-cb-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="flex items-center gap-2 text-base font-bold text-cb-fg">
                    <MapPin className="h-4 w-4 text-cb-terracotta-deep" />
                    Deliver to
                  </h2>
                  <button
                    type="button"
                    onClick={() => setStep("address")}
                    className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep"
                  >
                    Change
                    <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
                  </button>
                </div>
                {selectedAddress && (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-cb-fg">
                      {(() => {
                        const Icon = TYPE_ICON[selectedAddress.address_type] ?? MapPin;
                        return <Icon className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />;
                      })()}
                      {selectedAddress.label?.trim() ||
                        (selectedAddress.address_type === "home"
                          ? "Home"
                          : selectedAddress.address_type === "work"
                            ? "Work"
                            : "Other")}{" "}
                      · {selectedAddress.full_name}
                    </p>
                    <p className="text-sm text-cb-muted-fg">
                      {[selectedAddress.address_line_1, selectedAddress.area].filter(Boolean).join(", ")},{" "}
                      {selectedAddress.city} – {selectedAddress.postal_code}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-cb-muted-fg">
                      <Phone className="h-3.5 w-3.5" />
                      +91 {selectedAddress.phone}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <StallCard title="Collect from" />
            )}

            <div className="bg-white rounded-2xl border border-cb-border p-5">
              <h2 className="flex items-center gap-2 text-base font-bold text-cb-fg mb-3">
                <Receipt className="h-4 w-4 text-cb-terracotta-deep" />
                Payment
              </h2>
              <p className="text-sm text-cb-muted-fg mb-4">
                Pay CozyBerries directly from any UPI app — scan the QR code, or pay to our UPI ID or phone number.
                We&apos;ll confirm within a few hours and start packing.
              </p>

              <div className="flex items-center gap-4 rounded-2xl border border-cb-border p-4 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={STATIC_QR_CODE_URL} alt="UPI payment QR code" className="h-24 w-24 rounded-lg shrink-0" />
                <div>
                  <p className="text-sm text-cb-muted-fg">Scan &amp; pay</p>
                  <p className="text-2xl font-bold text-cb-fg">₹{total.toFixed(0)}</p>
                  <p className="text-xs text-cb-muted-fg mt-1">Works with GPay, PhonePe, Paytm &amp; any UPI app</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-cb-border p-3 mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cb-peach text-cb-terracotta-deep font-bold">
                    ₹
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-cb-muted-fg">UPI ID</p>
                    <p className="font-bold text-cb-fg truncate">{UPI_ID}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(UPI_ID)}
                  className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-cb-border p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cb-peach text-cb-terracotta-deep">
                    <Phone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-cb-muted-fg">Phone number (UPI)</p>
                    <p className="font-bold text-cb-fg truncate">{UPI_PHONE_NUMBER}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(UPI_PHONE_NUMBER)}
                  className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>

              <p className="flex items-start gap-2 text-sm text-cb-muted-fg mt-3">
                <MessageCircle className="h-4 w-4 shrink-0 mt-0.5" />
                Tip: share your payment screenshot on WhatsApp to speed up confirmation.
              </p>
            </div>

            {impersonation.active && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">Admin tools — Shadow mode</h3>
                <p className="text-xs text-amber-800 mb-3">
                  Overrides apply only to this order. Customer coupons are ignored when override is active.
                </p>
                <label className="flex items-start gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={adminOverrideEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAdminOverrideEnabled(next);
                      if (!next) {
                        setAdminOverrideAmount("");
                        setAdminOverrideNote("");
                      }
                    }}
                  />
                  <span className="text-sm text-amber-900">Apply custom discount override</span>
                </label>
                {adminOverrideEnabled && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="admin-override-amount" className="text-sm text-amber-900">
                        Discount amount (₹)
                      </Label>
                      <Input
                        id="admin-override-amount"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={subtotal}
                        step={1}
                        value={adminOverrideAmount}
                        onChange={(e) => setAdminOverrideAmount(e.target.value)}
                        placeholder="0"
                        className="bg-white"
                      />
                      {!overrideAmountValid && adminOverrideAmount.length > 0 && (
                        <p className="mt-1 text-xs text-red-600">
                          Amount must be a non-negative integer no greater than the subtotal (₹{subtotal.toFixed(0)}).
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="admin-override-note" className="text-sm text-amber-900">
                        Reason (required)
                      </Label>
                      <Textarea
                        id="admin-override-note"
                        rows={2}
                        value={adminOverrideNote}
                        maxLength={ADMIN_OVERRIDE_NOTE_MAX_LEN}
                        onChange={(e) => setAdminOverrideNote(e.target.value)}
                        placeholder="e.g. Wholesale, phone-order negotiated price — min 3 chars"
                        className="bg-white"
                      />
                      {!overrideNoteValid && adminOverrideNote.length > 0 && (
                        <p className="mt-1 text-xs text-red-600">
                          Reason must be {ADMIN_OVERRIDE_NOTE_MIN_LEN}–{ADMIN_OVERRIDE_NOTE_MAX_LEN} characters.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <OrderSummary
              cart={cart}
              subtotal={subtotal}
              discountAmount={discountAmount}
              deliveryCharge={deliveryCharge}
              total={total}
              offerCode={overrideActive ? null : offer?.code ?? null}
              fulfilment={fulfilment}
              showItems={false}
            />
          </>
        )}
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-30 border-t border-cb-border bg-white p-4">
        <div className="container mx-auto max-w-2xl flex items-center gap-4">
          <div className="shrink-0">
            <p className="text-xs text-cb-muted-fg">Total</p>
            <p className="text-lg font-bold text-cb-fg">₹{total.toFixed(0)}</p>
          </div>
          {step === "address" ? (
            <Button
              className="ml-auto flex-1 max-w-xs h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2"
              disabled={!readyToContinue}
              onClick={() => setStep("payment")}
            >
              Continue to payment
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              className="ml-auto flex-1 max-w-xs h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white"
              disabled={isPlacingOrder || !readyToContinue || (overrideActive && !overrideValid)}
              onClick={handlePlaceOrder}
            >
              {isPlacingOrder ? "Placing order..." : "Place Order"}
            </Button>
          )}
        </div>
      </div>

      <AddressFormModal
        isOpen={showAddAddress || !!editingAddress}
        isEditing={!!editingAddress}
        isSaving={false}
        addressData={addressData}
        validationErrors={addressValidationErrors}
        addresses={addresses}
        enablePincodeCheck
        profilePhone={profile?.phone ?? undefined}
        profileFullName={profile?.full_name ?? undefined}
        onClose={handleCloseAddressModal}
        onSave={handleAddressModalSave}
        onInputChange={(field, value) => setAddressData((prev) => ({ ...prev, [field]: value }))}
      />
    </div>
  );
}

function OrderSummary({
  cart,
  subtotal,
  discountAmount,
  deliveryCharge,
  total,
  offerCode,
  fulfilment,
  showItems,
}: {
  cart: { id: string; name: string; price: number; quantity: number; image?: string; size?: string; color?: string }[];
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  total: number;
  offerCode: string | null;
  fulfilment: FulfilmentMethod;
  showItems: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-cb-border p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-cb-fg mb-4">
        <Receipt className="h-4 w-4 text-cb-terracotta-deep" />
        Order summary
      </h2>

      {showItems && (
        <div className="space-y-3 mb-4">
          {cart.map((item) => (
            <div key={`${item.id}-${item.size ?? ""}-${item.color ?? ""}`} className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
                {item.image && <SupabaseImage src={item.image} preset="thumbnail" alt={item.name} fill className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-cb-fg truncate">{item.name}</p>
                <p className="text-sm text-cb-muted-fg">
                  {[item.size && `Size ${item.size}`, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="text-sm font-bold text-cb-fg shrink-0">₹{(item.price * item.quantity).toFixed(0)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-cb-linen p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-cb-muted-fg">Subtotal</span>
          <span className="font-semibold text-cb-fg">₹{subtotal.toFixed(0)}</span>
        </div>
        {offerCode && discountAmount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-cb-muted-fg">Discount ({offerCode})</span>
            <span className="font-semibold text-cb-terracotta">−₹{discountAmount.toFixed(0)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-cb-muted-fg">Delivery</span>
          <span className={`font-semibold ${deliveryCharge === 0 ? "text-cb-success" : "text-cb-fg"}`}>
            {fulfilment === "pickup" ? "Free (pickup)" : deliveryCharge === 0 ? "Free" : `₹${deliveryCharge.toFixed(0)}`}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-cb-border text-base">
          <span className="font-bold text-cb-fg">Total</span>
          <span className="font-bold text-cb-fg">₹{total.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
