"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { images } from "@/app/assets/images";
import CartItemRow from "@/components/CartItem";
import Link from "next/link";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import { useCartTotals } from "@/hooks/useCartTotals";
import { getActiveOffer } from "@/lib/utils/discount";

export default function CartSheet() {
  const { cart, updateQuantity, removeFromCart, clearCart, isLoading } =
    useCart();
  const [open, setOpen] = useState(false);
  const offer = getActiveOffer();
  const {
    subtotal,
    discountAmount,
    discountedSubtotal,
    deliveryCharge,
    grandTotal,
  } = useCartTotals(cart, offer);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative lg:w-10 lg:h-10 w-12 h-12"
        >
          <ShoppingCart className="h-6 w-6 lg:h-5 lg:w-5" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
          <span className="sr-only">Cart</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(90vw,400px)] p-0 shadow-2xl ring-1 ring-black/10 border-0">
        <div className="flex h-full flex-col min-h-0">
          <SheetHeader className="p-4 border-b shrink-0">
            <SheetTitle>Your Cart</SheetTitle>
          </SheetHeader>
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-0 overscroll-contain">            {isLoading ? (
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

          {cart.length > 0 && (
            <div className="border-t p-4 space-y-3 shrink-0">
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
                      <p className="text-gray-600 text-sm">Add ₹{(FREE_DELIVERY_THRESHOLD - discountedSubtotal).toFixed(0)} more</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((discountedSubtotal / FREE_DELIVERY_THRESHOLD) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center text-base">
                <span className="font-medium">Total</span>
                <span className="font-bold">₹{grandTotal.toFixed(0)}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setOpen(false)}
                  className="w-full"
                  asChild
                >
                  <Link href="/checkout">Checkout</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
