"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
import PhoneInput from "@/components/PhoneInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { user } = useAuth();
  const redirectTo = searchParams.get("redirect");

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          intent: "register",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          res.status === 429
            ? "Too many requests. Please try again later."
            : (data?.error as string) || "Something went wrong. Please try again.";
        setError(message);
        setLoading(false);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Register with phone
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{" "}
            <Link
              href={registerHref}
              className="font-medium text-primary hover:text-primary/80"
            >
              use email instead
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
