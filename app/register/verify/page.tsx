"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/supabase-auth-provider";

const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
const OTP_PHONE_KEY = "otp_phone";

export default function RegisterVerifyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");
  const [redirectingToProfile, setRedirectingToProfile] = useState(false);

  // Already logged in: no need to verify OTP
  useEffect(() => {
    if (user) {
      router.replace("/profile");
    }
  }, [user, router]);

  useEffect(() => {
    if (user) return;
    const storedId = sessionStorage.getItem(OTP_VERIFICATION_ID_KEY);
    const storedPhone = sessionStorage.getItem(OTP_PHONE_KEY);

    if (!storedId?.trim() || !storedPhone?.trim()) {
      router.replace("/register/phone");
      return;
    }
    setVerificationId(storedId.trim());
    setPhone(storedPhone.trim());
    setReady(true);
  }, [user, router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendSuccess("");
    const trimmedCode = code.replace(/\D/g, "");
    if (trimmedCode.length < 4 || trimmedCode.length > 6) {
      setError("Enter a 4–6 digit code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verifynow/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId,
          code: trimmedCode,
          intent: "register",
          phone,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError((data?.error as string) || "Verification failed. Please try again.");
        setLoading(false);
        return;
      }

      const { redirectUrl } = data;
      if (redirectUrl && typeof redirectUrl === "string") {
        sessionStorage.removeItem(OTP_VERIFICATION_ID_KEY);
        sessionStorage.removeItem(OTP_PHONE_KEY);
        setRedirectingToProfile(true);
        // Allow loading screen to paint before redirect
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 100);
        });
        return;
      }
      setError("Invalid response. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendSuccess("");
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/verifynow/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          intent: "register",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many requests. Please try again later.");
        } else {
          setError((data?.error as string) || "Failed to resend OTP. Please try again.");
        }
        setResendLoading(false);
        return;
      }

      const { verificationId: newVerificationId } = data;
      if (newVerificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, newVerificationId);
        setVerificationId(newVerificationId);
      }
      setResendSuccess("OTP sent again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  if (redirectingToProfile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Creating your account...</p>
        <p className="text-xs text-muted-foreground mt-1">Taking you to your profile</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-light text-gray-900">
            Verify your phone
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            We sent a code to {phone}.{" "}
            <Link
              href="/register/phone"
              className="font-medium text-primary hover:text-primary/80"
            >
              Change number
            </Link>
          </p>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleVerify}>
          <div className="space-y-4">
            <Label htmlFor="otp-code">Verification code</Label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter 4–6 digit code"
              disabled={loading}
              aria-describedby={error ? "otp-error" : undefined}
            />
          </div>

          {error && (
            <p id="otp-error" className="text-sm text-red-600 text-center" role="alert">
              {error}
            </p>
          )}
          {resendSuccess && (
            <p className="text-sm text-green-600 text-center" role="status">
              {resendSuccess}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || code.replace(/\D/g, "").length < 4}
            className="w-full"
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>

          <p className="text-center text-sm text-gray-600">
            Didn&apos;t receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading || loading}
              className="font-medium text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? "Sending..." : "Resend OTP"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
