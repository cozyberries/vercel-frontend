"use client";

import Link from "next/link";
import { ShoppingCart, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CartItemRow from "@/components/CartItem";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

export default function CartPage() {
    const { cart, updateQuantity, removeFromCart, clearCart, isLoading } = useCart();

    const subtotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    const deliveryCharge = cart.length > 0 && subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE_INR : 0;
    const grandTotal = subtotal + deliveryCharge;

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
                    {cart.length !== 0 && (
                        <div className="flex justify-end">
                            <Button
                                variant={"link"}
                                className="w-fit text-red-400"
                                onClick={clearCart}
                            >
                                clear all
                            </Button>
                        </div>
                    )}
                    <div className="p-4">
                        {isLoading ? (
                            <div className="py-8 text-center text-muted-foreground">
                                <div className="animate-pulse">Loading cart...</div>
                            </div>
                        ) : cart.length === 0 ? (
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
                        <div className="flex justify-between items-center text-base">
                            <span className="font-medium">Delivery Charge</span>
                            {deliveryCharge === 0 && cart.length > 0 ? (
                                <span className="font-semibold text-green-600">FREE</span>
                            ) : (
                                <span className="font-semibold">₹{deliveryCharge.toFixed(0)}</span>
                            )}
                        </div>
                        {subtotal < FREE_DELIVERY_THRESHOLD && cart.length > 0 && (
                            <div className="bg-primary/10 border border-primary/20 rounded-md p-3 text-sm">
                                <p className="text-primary font-medium">
                                    Add products worth ₹{(FREE_DELIVERY_THRESHOLD - subtotal).toFixed(0)} to get free shipping.
                                </p>
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