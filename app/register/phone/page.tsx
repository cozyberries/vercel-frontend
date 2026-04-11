"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
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

const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
const OTP_PHONE_KEY = "otp_phone";
const OTP_REGISTER_FULL_NAME_KEY = "otp_register_full_name";
const OTP_REGISTER_EMAIL_KEY = "otp_register_email";

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes(":")) return false;
  return true;
}

export default function RegisterPhonePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithGoogle } = useAuth();
  const redirectTo = searchParams.get("redirect");

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    status: CheckRegistrationStatus;
    message: string;
  }>({ open: false, status: "none", message: "" });

  // Already logged in: redirect to profile or intended page
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

  const registerEmailHref = isSafeRedirect(redirectTo)
    ? `/register/email?redirect=${encodeURIComponent(redirectTo)}`
    : "/register/email";
  const loginHref = isSafeRedirect(redirectTo)
    ? `/login?redirect=${encodeURIComponent(redirectTo)}`
    : "/login";

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  const doSendOtp = async () => {
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
        if (fullName.trim()) sessionStorage.setItem(OTP_REGISTER_FULL_NAME_KEY, fullName.trim());
        else sessionStorage.removeItem(OTP_REGISTER_FULL_NAME_KEY);
        if (email.trim()) sessionStorage.setItem(OTP_REGISTER_EMAIL_KEY, email.trim());
        else sessionStorage.removeItem(OTP_REGISTER_EMAIL_KEY);
        router.push("/register/verify");
        return;
      }

      setError("Invalid response. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError("");
    setPhoneError("");

    const digits = phone.replace(/\D/g, "");
    const phoneValidation = validateRequiredPhoneNumber(digits);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Invalid phone number");
      return;
    }

    setLoading(true);
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
    } catch {
      // Ignore — fail open
    } finally {
      setLoading(false);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Register with phone
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{" "}
            <Link href={loginHref} className="font-medium text-primary hover:text-primary/80">
              sign in to your existing account
            </Link>
            {" · "}
            <Link
              href={registerEmailHref}
              className="font-medium text-primary hover:text-primary/80"
            >
              use email instead
            </Link>
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={isGoogleLoading || loading}
            variant="outline"
            className="w-full gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
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
        </div>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-50 px-2 text-muted-foreground">Or register with phone</span>
            </div>
          </div>
        </div>

        <div
          className="mt-6 space-y-6"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSendOtp();
            }
          }}
        >
          <div className="space-y-4">
            <PhoneInput
              value={phone}
              onChange={setPhone}
              error={phoneError}
              onErrorChange={setPhoneError}
            />
            <div>
              <Label htmlFor="register-full-name">
                Full name <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="register-full-name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="register-email">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              We&apos;ll send a one-time code via SMS.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            className="w-full relative z-10"
            disabled={loading || isGoogleLoading}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!loading) handleSendOtp();
            }}
          >
            <Phone className="w-5 h-5" />
            {loading ? "Sending OTP..." : "Send OTP"}
          </Button>
        </div>

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
