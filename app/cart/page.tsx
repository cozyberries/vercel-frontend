"use client";

import Link from "next/link";
import { ShoppingCart, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart, getCartItemKey } from "@/components/cart-context";
import CartItemRow from "@/components/CartItem";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCartTotals } from "@/hooks/useCartTotals";
import { getActiveOffer } from "@/lib/utils/discount";

export default function CartPage() {
    const { cart, updateQuantity, removeFromCart, isLoading } = useCart();
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 pt-6 pb-24">
            <h1 className="text-xl font-semibold mb-6">
                My Cart
                {cart.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({cart.length} {cart.length === 1 ? "item" : "items"})
                    </span>
                )}
            </h1>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6 w-full">
                <div className="col-span-3 max-h-[500px] overflow-y-auto">
                    <div className="p-4">
                        {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="mb-6">
                                    <ShoppingCart className="h-16 w-16 text-muted-foreground/40" />
                                </div>
                                <h3 className="text-lg font-medium text-muted-foreground mb-2">
                                    Your cart is empty
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Add items to get started
                                </p>
                            </div>
                        ) : (
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
                        )}
                    </div>
                </div>
                {cart.length > 0 && (
                    <div className="p-4 space-y-3 col-span-2">
                        <div className="flex justify-between items-center text-base">
                            <span className="font-medium">Subtotal</span>
                            <span className="font-semibold">₹{subtotal.toFixed(0)}</span>
                        </div>
                        {offer && discountAmount > 0 && (
                            <>
                                <div className="flex justify-between items-center text-base text-muted-foreground">
                                    <span className="font-medium">Promo ({offer.code})</span>
                                    <span className="text-green-600 text-xs font-semibold">Applied</span>
                                </div>
                                <div className="flex justify-between items-center text-base text-green-600">
                                    <span className="font-medium">Discount ({offer.badgeText})</span>
                                    <span className="font-semibold">-₹{discountAmount.toFixed(0)}</span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between items-center text-base">
                            <span className="font-medium">Delivery Charge</span>
                            {deliveryCharge === 0 ? (
                                <span className="font-semibold text-green-600">FREE</span>
                            ) : (
                                <span className="font-semibold">₹{deliveryCharge.toFixed(0)}</span>
                            )}
                        </div>
                        {discountedSubtotal < FREE_DELIVERY_THRESHOLD && (
                            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-4 shadow-sm">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                                        <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-4L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-primary font-semibold text-lg">Free shipping awaits!</p>
                                        <p className="text-muted-foreground text-sm">Add ₹{(FREE_DELIVERY_THRESHOLD - discountedSubtotal).toFixed(0)} more</p>                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div 
                                        className="w-full bg-gray-100 rounded-full h-2"
                                        role="progressbar"
                                        aria-valuenow={Math.round((discountedSubtotal / FREE_DELIVERY_THRESHOLD) * 100)}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-label="Progress toward free delivery"
                                    >
                                        <div
                                            className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${Math.min((discountedSubtotal / FREE_DELIVERY_THRESHOLD) * 100, 100)}%` }}
                                        />
                                    </div>                        
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-base border-t py-2">
                            <span className="font-medium">Total</span>
                            <span className="font-bold">₹{grandTotal.toFixed(0)}</span>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                className="w-full"
                                asChild
                            >
                                <Link href="/checkout">Checkout</Link>
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}