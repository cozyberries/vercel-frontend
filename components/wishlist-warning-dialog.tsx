import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from './ui/button';
import { WishlistItem } from './wishlist-context';

interface WishlistWarningDialogProps {
    wishlist: WishlistItem[];
    showClearConfirm: boolean;
    setShowClearConfirm: (show: boolean) => void;
    clearWishlist: () => Promise<void>;    setOpen?: (open: boolean) => void;
}

export default function WishlistWarningDialog({
    wishlist,
    showClearConfirm,
    setShowClearConfirm,
    clearWishlist,
    setOpen,
}: WishlistWarningDialogProps) {
    return (
        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Clear wishlist?</DialogTitle>
                    <DialogDescription>
                        This will remove all {wishlist.length} {wishlist.length === 1 ? "item" : "items"} from your wishlist. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={async () => {
                            await clearWishlist();
                            setShowClearConfirm(false);
                            setOpen?.(false);
                        }}
                    >
                        Clear All
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}