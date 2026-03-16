"use client";

import { useState } from "react";
import { Heart, HeartOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useWishlist } from "@/components/wishlist-context";
import WishlistItem from "@/components/WishlistItem";
import WishlistWarningDialog from "./wishlist-warning-dialog";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";

export default function WishlistSheet() {
  const { wishlist, removeFromWishlist, clearWishlist, isLoading } =
    useWishlist();
  const [open, setOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const swipeRightToClose = useSwipeToClose("right", () => setOpen(false));

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:h-10 lg:w-10 h-12 w-12 relative"
          >
            <Heart
              className={`h-6 w-6 lg:h-5 lg:w-5 ${wishlist.length > 0 ? "fill-red-500 text-red-500" : ""
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
        <SheetContent side="right" className="w-[min(90vw,400px)] p-0">
          <div
            className="flex h-full flex-col touch-pan-y"
            {...swipeRightToClose}
          >
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Your Wishlist</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">
                  <div className="animate-pulse">Loading wishlist...</div>
                </div>
              ) : wishlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-6">
                    <HeartOff className="h-16 w-16 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-lg font-medium text-muted-foreground mb-2">
                    Your wishlist is empty
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Save items you love for later
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {wishlist.map((item) => (
                    <WishlistItem
                      key={item.id}
                      item={item}
                      onRemove={removeFromWishlist}
                      setOpen={() => setOpen(false)}
                    />
                  ))}
                </div>
              )}
            </div>

            {wishlist.length > 0 && (
              <div className="border-t p-4 space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowClearConfirm(true)}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <WishlistWarningDialog
        wishlist={wishlist}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        clearWishlist={clearWishlist}
      />
    </>
  );
}
