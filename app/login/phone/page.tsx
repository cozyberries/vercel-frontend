"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/supabase-auth-provider";
import { validateRequiredPhoneNumber } from "@/lib/utils/validation";

const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
const OTP_PHONE_KEY = "otp_phone";

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes(":")) return false;
  return true;
}

export default function LoginPhonePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const redirectTo = searchParams.get("redirect");

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noAccount, setNoAccount] = useState(false);

  // Already logged in: redirect to profile or intended page
  useEffect(() => {
    if (user) {
      const destination = isSafeRedirect(redirectTo) ? redirectTo : "/profile";
      router.replace(destination);
    }
  }, [user, redirectTo, router]);

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  const emailLoginHref = isSafeRedirect(redirectTo)
    ? `/login/email?redirect=${encodeURIComponent(redirectTo)}`
    : "/login/email";
  const registerHref = isSafeRedirect(redirectTo)
    ? `/register?redirect=${encodeURIComponent(redirectTo)}`
    : "/register";

  useEffect(() => {
    if (isSafeRedirect(redirectTo)) {
      document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=300; SameSite=Lax`;
    }
  }, [redirectTo]);

  const handleSendOtp = async () => {
    setError("");
    setPhoneError("");
    setNoAccount(false);

    const digits = phone.replace(/\D/g, "");
    const phoneValidation = validateRequiredPhoneNumber(digits);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Invalid phone number");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verifynow/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: digits,
          intent: "login",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404) {
          setNoAccount(true);
          setError((data?.error as string) || "No account with this number. Please register first.");
        } else {
          const message =
            res.status === 429
              ? "Too many requests. Please try again later."
              : (data?.error as string) || "Something went wrong. Please try again.";
          setError(message);
        }
        setLoading(false);
        return;
      }

      const { verificationId } = data;
      if (verificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, verificationId);
        sessionStorage.setItem(OTP_PHONE_KEY, digits);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Sign in with phone
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{" "}
            <Link
              href={emailLoginHref}
              className="font-medium text-primary hover:text-primary/80"
            >
              use email instead
            </Link>
            {" · "}
            <Link href={registerHref} className="font-medium text-primary hover:text-primary/80">
              create a new account
            </Link>
          </p>
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
            <p className="text-sm text-muted-foreground">
              We&apos;ll send a one-time code via SMS.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center" role="alert">
              {error}
            </p>
          )}
          {noAccount && (
            <p className="text-sm text-center">
              <Link href={registerHref} className="font-medium text-primary hover:text-primary/80">
                Register with this number
              </Link>
            </p>
          )}

          <Button
            type="button"
            className="w-full relative z-10"
            disabled={loading}
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
      </div>
    </div>
  );
}
