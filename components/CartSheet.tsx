"use client";

import { useState } from "react";
import { ShoppingBag, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/components/cart-context";
import { images } from "@/app/assets/images";
import CartItem from "@/components/CartItem";
import Link from "next/link";

export default function CartSheet() {
  const { cart, updateQuantity, removeFromCart, clearCart } = useCart();
  const [open, setOpen] = useState(false);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const deliveryCharge = cart.length > 0 ? 50 : 0;
  const grandTotal = subtotal + deliveryCharge;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingBag className="h-5 w-5" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
          <span className="sr-only">Cart</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[350px] sm:w-[400px] p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="p-4 border-b">
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
          <div className="flex-1 overflow-y-auto p-4">
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
                  <CartItem
                    key={item.id}
                    item={item}
                    onQuantityChange={updateQuantity}
                    onRemove={removeFromCart}
                  />
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t p-4 space-y-3">
              <div className="flex justify-between items-center text-base">
                <span className="font-medium">Subtotal</span>
                <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-base">
                <span className="font-medium">Delivery Charge</span>
                <span className="font-semibold">
                  ₹{deliveryCharge.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-base">
                <span className="font-medium">Total</span>
                <span className="font-bold">₹{grandTotal.toFixed(2)}</span>
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
