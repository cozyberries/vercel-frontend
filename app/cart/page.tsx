"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight, LogIn, CheckCircle2, Tag, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import CartItemRow from "@/components/CartItem";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCartTotals } from "@/hooks/useCartTotals";
import { getActiveOffer } from "@/lib/utils/discount";

export default function CartPage() {
    const { cart, updateQuantity, removeFromCart, isLoading } = useCart();
    const { user } = useAuth();
    // Auth resolves client-only; gate on `mounted` so the checkout button's
    // label/href matches the server-rendered guest state on first paint
    // (avoids a hydration mismatch for already-logged-in users).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const isLoggedIn = mounted && !!user;
    const offer = getActiveOffer();
    const {
        subtotal,
        discountAmount,
        discountedSubtotal,
        deliveryCharge,
        grandTotal,
    } = useCartTotals(cart, offer);

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cb-terracotta" />
            </div>
        );
    }

    if (cart.length === 0) {
        return (
            <div className="container mx-auto px-4 py-6">
                <h1 className="text-2xl font-light text-cb-fg mb-6">Your Cart</h1>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <div className="mb-6 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-cb-linen">
                        <ShoppingBag className="h-7 w-7 text-cb-fg" />
                    </div>
                    <h2 className="text-xl font-light text-cb-fg mb-2">
                        Your cart is empty
                    </h2>
                    <p className="text-sm text-cb-muted-fg mb-6 max-w-[260px]">
                        Add something soft and cozy.
                    </p>
                    <Button
                        asChild
                        className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-[46px] px-6 text-[15px] font-semibold gap-1.5"
                    >
                        <Link href="/products">
                            Start shopping
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    const freeDeliveryUnlocked = discountedSubtotal >= FREE_DELIVERY_THRESHOLD;

    return (
        <div className="container mx-auto max-w-3xl px-4 py-6 pb-28 lg:pb-32">
            <h1 className="text-2xl font-light text-cb-fg">Your Cart</h1>
            <p className="text-sm text-cb-muted-fg mb-6">
                {cart.length} {cart.length === 1 ? "item" : "items"}
            </p>

            <div className="flex flex-col gap-4">
                {cart.map((item) => (
                    <CartItemRow
                        key={getCartItemKey(item)}
                        item={item}
                        onQuantityChange={updateQuantity}
                        onRemove={removeFromCart}
                    />
                ))}
            </div>

            <div className="mt-4 space-y-4">
                {offer && discountAmount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-cb-peach px-4 py-3 text-cb-terracotta-deep">
                        <Tag className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">
                            {offer.code} applied — {Math.round(offer.discountRate * 100)}% off
                        </span>
                        <Check className="h-4 w-4 shrink-0 ml-auto" />
                    </div>
                )}

                {freeDeliveryUnlocked ? (
                    <div className="flex items-center gap-2 text-cb-success">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-semibold">You&apos;ve unlocked free delivery</span>
                    </div>
                ) : (
                    <div className="rounded-xl bg-cb-linen p-4">
                        <p className="text-sm text-cb-fg mb-2">
                            Add ₹{(FREE_DELIVERY_THRESHOLD - discountedSubtotal).toFixed(0)} more for free delivery
                        </p>
                        <div className="h-2 w-full rounded-full bg-white overflow-hidden">
                            <div
                                className="h-2 rounded-full bg-cb-terracotta transition-all duration-300"
                                style={{ width: `${Math.min((discountedSubtotal / FREE_DELIVERY_THRESHOLD) * 100, 100)}%` }}
                                role="progressbar"
                                aria-valuenow={Math.round((discountedSubtotal / FREE_DELIVERY_THRESHOLD) * 100)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label="Progress toward free delivery"
                            />
                        </div>
                    </div>
                )}

                <div className="rounded-2xl bg-cb-linen p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-cb-muted-fg">Subtotal</span>
                        <span className="font-semibold text-cb-fg">₹{subtotal.toFixed(0)}</span>
                    </div>
                    {offer && discountAmount > 0 && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-cb-muted-fg">Discount ({offer.code})</span>
                            <span className="font-semibold text-cb-terracotta">−₹{discountAmount.toFixed(0)}</span>
                        </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-cb-muted-fg">Delivery</span>
                        <span className={`font-semibold ${deliveryCharge === 0 ? "text-cb-success" : "text-cb-fg"}`}>
                            {deliveryCharge === 0 ? "Free" : `₹${deliveryCharge.toFixed(0)}`}
                        </span>
                    </div>
                    <div className="flex items-center justify-between pt-2.5 border-t border-cb-border text-base">
                        <span className="font-bold text-cb-fg">Total</span>
                        <span className="font-bold text-cb-fg">₹{grandTotal.toFixed(0)}</span>
                    </div>
                </div>
            </div>

            {/* Sticky checkout bar — all breakpoints, matching design */}
            <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-30 border-t border-cb-border bg-white px-4 py-3">
                <div className="container mx-auto max-w-3xl flex items-center gap-4">
                    <div>
                        <p className="text-xs text-cb-muted-fg">Total</p>
                        <p className="text-lg font-bold text-cb-fg">₹{grandTotal.toFixed(0)}</p>
                    </div>
                    <Button
                        asChild
                        className="ml-auto flex-1 max-w-[280px] rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 text-[15px] font-semibold gap-2"
                    >
                        {isLoggedIn ? (
                            <Link href="/checkout">
                                Checkout
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        ) : (
                            <Link href="/login">
                                Sign in to checkout
                                <LogIn className="h-4 w-4" />
                            </Link>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
