"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, User } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CheckRegistrationStatus } from "@/app/api/auth/check-registration/route";
import { useAuth } from "@/components/supabase-auth-provider";
import { validateRequiredPhoneNumber } from "@/lib/utils/validation";
import { isSafeRedirect } from "@/lib/utils/redirect";
import { images } from "@/app/assets/images";
import {
  OTP_VERIFICATION_ID_KEY,
  OTP_PHONE_KEY,
  OTP_FULL_NAME_KEY,
  OTP_EMAIL_KEY,
  OTP_INTENT_KEY,
} from "@/lib/auth/otp-session";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithGoogle } = useAuth();
  const redirectTo = searchParams.get("redirect");
  const phoneParam = (searchParams.get("phone") ?? "").replace(/\D/g, "");

  const [fullName, setFullName] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [phone, setPhone] = useState(phoneParam);
  const [phoneError, setPhoneError] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    status: CheckRegistrationStatus;
    message: string;
  }>({ open: false, status: "none", message: "" });

  const loginHref = isSafeRedirect(redirectTo)
    ? `/login?redirect=${encodeURIComponent(redirectTo)}`
    : "/login";

  // Already signed in: redirect to profile or intended page
  useEffect(() => {
    if (user) {
      const destination = isSafeRedirect(redirectTo) ? redirectTo : "/profile";
      router.replace(destination);
    }
  }, [user, redirectTo, router]);

  useEffect(() => {
    if (isSafeRedirect(redirectTo)) {
      document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300; SameSite=Lax`;
    }
  }, [redirectTo]);

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cb-linen py-12 px-4">
        <p className="text-sm text-cb-muted-fg">Redirecting...</p>
      </div>
    );
  }

  const doSendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const res = await fetch("/api/auth/verifynow/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, intent: "register" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          res.status === 429
            ? "Too many requests. Please try again later."
            : (data?.error as string) || "Something went wrong. Please try again.";
        setError(message);
        return;
      }

      const { verificationId } = data;
      if (verificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, verificationId);
        sessionStorage.setItem(OTP_PHONE_KEY, digits);
        sessionStorage.setItem(OTP_INTENT_KEY, "register");
        if (fullName.trim()) sessionStorage.setItem(OTP_FULL_NAME_KEY, fullName.trim());
        else sessionStorage.removeItem(OTP_FULL_NAME_KEY);
        if (email.trim()) sessionStorage.setItem(OTP_EMAIL_KEY, email.trim());
        else sessionStorage.removeItem(OTP_EMAIL_KEY);
        router.push("/login/verify");
        return;
      }

      setError("Invalid response. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setError("");
    setPhoneError("");
    setFullNameError("");
    if (!fullName.trim()) {
      setFullNameError("Full name is required");
      return;
    }

    const digits = phone.replace(/\D/g, "");
    const phoneValidation = validateRequiredPhoneNumber(digits);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Invalid phone number");
      return;
    }

    setLoading(true);
    // When proceeding to doSendOtp, keep loading=true to avoid a flicker.
    // Only set it false in the branches that stop here (conflicts / errors).
    let shouldProceed = false;
    try {
      const res = await fetch("/api/auth/check-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, email: email.trim() || undefined }),
      });

      // Fail open: if check errors, proceed to send OTP anyway
      if (res.ok) {
        const data = await res.json().catch(() => ({ status: "none" }));
        const status = (data?.status ?? "none") as CheckRegistrationStatus;

        if (status === "already_registered") {
          setError(
            "This phone and email are already linked to an account. Please sign in instead."
          );
          return;
        }

        if (status === "both_exist_separate_accounts") {
          setError(
            data.message ||
              "This phone number and email address are registered to separate accounts. Please sign in with one of them instead."
          );
          return;
        }

        if (status !== "none") {
          setConflictDialog({ open: true, status, message: data.message ?? "" });
          return;
        }
      }
      shouldProceed = true;
    } catch {
      shouldProceed = true; // fail open
    } finally {
      // Only reset loading when we're NOT continuing to doSendOtp.
      // doSendOtp manages its own loading state.
      if (!shouldProceed) setLoading(false);
    }

    await doSendOtp();
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError("");
    if (isSafeRedirect(redirectTo)) {
      document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300; SameSite=Lax`;
    }
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
      setIsGoogleLoading(false);
    }
  };

  const handleGuest = () => {
    if (isSafeRedirect(redirectTo)) {
      router.push(redirectTo);
      return;
    }
    router.back();
  };

  return (
    <div className="min-h-screen bg-cb-linen py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center text-center">
          <Image src={images.logoURL} alt="CozyBerries" width={64} height={64} className="h-16 w-16" />
          <h1 className="mt-4 text-3xl font-light text-cb-fg">Welcome to CozyBerries</h1>
          <p className="mt-2 text-sm text-cb-muted-fg">
            Create an account to track orders, save favourites and check out faster.
          </p>
        </div>

        <div
          className="mt-8 space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleContinue();
            }
          }}
        >
          <div>
            <Label htmlFor="signup-full-name">Full name</Label>
            <Input
              id="signup-full-name"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 h-12 rounded-xl bg-white"
            />
            {fullNameError && (
              <p className="text-sm text-destructive mt-1" role="alert">
                {fullNameError}
              </p>
            )}
          </div>

          <PhoneInput
            id="signup-phone"
            label="Mobile number"
            value={phone}
            onChange={setPhone}
            error={phoneError}
            onErrorChange={setPhoneError}
          />

          <div>
            <Label htmlFor="signup-email">
              Email <span className="text-cb-muted-fg font-normal">(optional)</span>
            </Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="For order updates & invoices"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-12 rounded-xl bg-white"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2"
            disabled={loading || isGoogleLoading}
            onClick={() => void handleContinue()}
          >
            {loading ? "Sending..." : "Continue"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-6 relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-cb-linen px-2 text-cb-muted-fg">or</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isGoogleLoading || loading}
            variant="outline"
            className="w-full h-12 rounded-full bg-white gap-2"
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
            {isGoogleLoading ? "Continuing with Google..." : "Continue with Google"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-full bg-cb-linen border-cb-border gap-2"
            onClick={handleGuest}
          >
            <User className="h-4 w-4" />
            Continue as guest
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-cb-muted-fg">
          By continuing you agree to CozyBerries&apos; Terms of Use and Privacy Policy.
        </p>
        <p className="mt-2 text-center text-xs text-cb-muted-fg">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-cb-terracotta-deep hover:underline">
            Sign in.
          </Link>
        </p>

        <AlertDialog
          open={conflictDialog.open}
          onOpenChange={(open: boolean) =>
            setConflictDialog((prev) => ({ ...prev, open }))
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Account already exists</AlertDialogTitle>
              <AlertDialogDescription>
                {conflictDialog.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                onClick={() => {
                  setConflictDialog((prev) => ({ ...prev, open: false }));
                  void doSendOtp();
                }}
              >
                Proceed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
