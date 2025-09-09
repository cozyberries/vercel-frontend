"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useWishlist } from "@/components/wishlist-context";

export default function WishlistSheet() {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-10 w-10 relative"
        >
          <Heart
            className={`h-5 w-5 ${
              wishlist.length > 0 ? "fill-red-500 text-red-500" : ""
            }`}
          />
          {wishlist.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-pink-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
              {wishlist.length}
            </span>
          )}
          <span className="sr-only">Wishlist</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[350px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Your Wishlist</SheetTitle>
        </SheetHeader>
        {wishlist.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Your wishlist is empty.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 py-4">
              {wishlist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 border-b pb-4"
                >
                  <img
                    src={item.image || "/placeholder.svg"}
                    alt={item.name}
                    className="w-16 h-16 object-cover rounded"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      <Link href={`/products/${item.id}`}>{item.name}</Link>
                    </div>
                    <div className="text-sm font-medium mt-1">
                      ₹{item.price.toFixed(2)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromWishlist(item.id)}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="destructive"
              className="mt-4 w-full"
              onClick={clearWishlist}
            >
              Clear All
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
