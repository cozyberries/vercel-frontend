"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/supabase-auth-provider";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { useWishlist } from "@/components/wishlist-context";
import {
  type PendingAuthIntent,
  PENDING_AUTH_INTENT_STORAGE_KEY,
  isSafeRedirectPath,
  parsePendingIntent,
  persistPendingIntentForRedirect,
} from "@/lib/auth/pending-auth-intent";

interface AuthGateContextValue {
  /**
   * Returns true if signed in — caller should run the action (with toasts as usual).
   * Returns false if auth is loading, or if guest — in the guest case the item is applied
   * silently to cart/wishlist (or buy-now temp cart) and the sign-in sheet is opened.
   */
  requireAuthForIntent: (intent: PendingAuthIntent) => boolean;
}

const AuthGateContext = createContext<AuthGateContextValue | undefined>(
  undefined,
);

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();
  const { cart, addToCart, addToCartTemporary } = useCart();
  const { addToWishlist } = useWishlist();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const draftIntentRef = useRef<PendingAuthIntent | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const redirectQuery = (() => {
    const current =
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    if (isSafeRedirectPath(current)) {
      return `?redirect=${encodeURIComponent(current)}`;
    }
    return "";
  })();

  const loginPhoneHref = `/login/phone${redirectQuery}`;
  const registerPhoneHref = `/register/phone${redirectQuery}`;
  const loginEmailHref = `/login/email${redirectQuery}`;
  const registerEmailHref = `/register/email${redirectQuery}`;

  const openSheet = useCallback((intent: PendingAuthIntent) => {
    draftIntentRef.current = intent;
    setSheetError("");
    setSheetOpen(true);
  }, []);

  const requireAuthForIntent = useCallback(
    (intent: PendingAuthIntent): boolean => {
      if (loading) return false;
      if (user) return true;
      if (intent.type === "wishlist") {
        addToWishlist(intent.item);
      } else if (intent.type === "cart") {
        addToCart(intent.item);
      } else {
        addToCartTemporary(intent.item);
      }
      openSheet(intent);
      return false;
    },
    [
      loading,
      user,
      addToWishlist,
      addToCart,
      addToCartTemporary,
      openSheet,
    ],
  );

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (!open) {
      draftIntentRef.current = null;
      setSheetError("");
    }
  }, []);

  const handleLinkClick = useCallback(() => {
    const draft = draftIntentRef.current;
    if (draft) persistPendingIntentForRedirect(draft);
  }, []);

  const handleGoogleClick = useCallback(async () => {
    const draft = draftIntentRef.current;
    if (draft) persistPendingIntentForRedirect(draft);
    setSheetError("");
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setSheetError(error.message ?? "Could not sign in with Google");
    }
  }, [signInWithGoogle]);

  useEffect(() => {
    if (!user || loading) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_AUTH_INTENT_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    const parsed = parsePendingIntent(raw);
    if (!parsed) {
      try {
        sessionStorage.removeItem(PENDING_AUTH_INTENT_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    try {
      sessionStorage.removeItem(PENDING_AUTH_INTENT_STORAGE_KEY);
    } catch {
      // ignore
    }

    if (parsed.type === "wishlist") {
      addToWishlist(parsed.item);
      setSheetOpen(false);
      draftIntentRef.current = null;
      return;
    }

    if (parsed.type === "cart") {
      const key = getCartItemKey(parsed.item);
      const alreadyHaveLine = cart.some(
        (c) => getCartItemKey(c) === key,
      );
      if (!alreadyHaveLine) {
        addToCart(parsed.item);
      }
      setSheetOpen(false);
      draftIntentRef.current = null;
      return;
    }

    if (parsed.type === "buy_now") {
      addToCartTemporary(parsed.item);
      setSheetOpen(false);
      draftIntentRef.current = null;
      router.push("/checkout");
    }
  }, [
    user,
    loading,
    cart,
    addToWishlist,
    addToCart,
    addToCartTemporary,
    router,
  ]);

  const value: AuthGateContextValue = {
    requireAuthForIntent,
  };

  return (
    <AuthGateContext.Provider value={value}>
      {children}
      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="flex flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Sign in to continue</SheetTitle>
            <SheetDescription>
              Your selection is saved on this device. Sign in to sync your
              wishlist and cart to your account.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={googleLoading}
              onClick={() => void handleGoogleClick()}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {googleLoading ? "Opening Google…" : "Continue with Google"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or use phone / email
                </span>
              </div>
            </div>

            <Button className="w-full" asChild>
              <Link
                href={loginPhoneHref}
                className="inline-flex items-center justify-center gap-2"
                onClick={handleLinkClick}
              >
                <Phone className="h-5 w-5" />
                Sign in with phone
              </Link>
            </Button>
            <Button variant="secondary" className="w-full" asChild>
              <Link href={registerPhoneHref} onClick={handleLinkClick}>
                Create account with phone
              </Link>
            </Button>
            <div className="flex flex-col gap-2 text-center text-sm">
              <Link
                href={loginEmailHref}
                className="text-primary hover:underline"
                onClick={handleLinkClick}
              >
                Sign in with email
              </Link>
              <Link
                href={registerEmailHref}
                className="text-muted-foreground hover:text-foreground hover:underline"
                onClick={handleLinkClick}
              >
                Register with email
              </Link>
            </div>
          </div>

          {sheetError ? (
            <p className="text-sm text-destructive" role="alert">
              {sheetError}
            </p>
          ) : null}
        </SheetContent>
      </Sheet>
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error("useAuthGate must be used within AuthGateProvider");
  }
  return ctx;
}
