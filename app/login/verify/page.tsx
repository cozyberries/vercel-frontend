"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/supabase-auth-provider";
import { images } from "@/app/assets/images";
import {
  OTP_VERIFICATION_ID_KEY,
  OTP_PHONE_KEY,
  OTP_FULL_NAME_KEY,
  OTP_EMAIL_KEY,
  OTP_INTENT_KEY,
  type OtpIntent,
} from "@/lib/auth/otp-session";

const CODE_LENGTH = 4;

export default function LoginVerifyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<OtpIntent>("login");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");
  const [redirectingToProfile, setRedirectingToProfile] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Already signed in: no need to verify OTP
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
      router.replace("/login");
      return;
    }
    const storedIntent = sessionStorage.getItem(OTP_INTENT_KEY);
    setIntent(storedIntent === "register" ? "register" : "login");
    setVerificationId(storedId.trim());
    setPhone(storedPhone.trim());
    setReady(true);
  }, [user, router]);

  const code = digits.join("");

  const handleDigitChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < CODE_LENGTH; i++) next[i] = pasted[i] ?? "";
      return next;
    });
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleVerify = async () => {
    setError("");
    setResendSuccess("");
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`);
      return;
    }

    setLoading(true);
    try {
      const fullName = sessionStorage.getItem(OTP_FULL_NAME_KEY)?.trim() || undefined;
      const email = sessionStorage.getItem(OTP_EMAIL_KEY)?.trim() || undefined;
      const res = await fetch("/api/auth/verifynow/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId,
          code,
          intent,
          phone,
          ...(fullName && { fullName }),
          ...(email && { email }),
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
        sessionStorage.removeItem(OTP_FULL_NAME_KEY);
        sessionStorage.removeItem(OTP_EMAIL_KEY);
        sessionStorage.removeItem(OTP_INTENT_KEY);
        setRedirectingToProfile(true);
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
        body: JSON.stringify({ phone, intent }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          res.status === 429
            ? "Too many requests. Please try again later."
            : (data?.error as string) || "Failed to resend OTP. Please try again."
        );
        setResendLoading(false);
        return;
      }

      const { verificationId: newVerificationId } = data;
      if (newVerificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, newVerificationId);
        setVerificationId(newVerificationId);
      }
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      setResendSuccess("OTP sent again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  if (user || redirectingToProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cb-linen py-12 px-4">
        <p className="text-sm text-cb-muted-fg">
          {redirectingToProfile ? "Signing you in..." : "Redirecting..."}
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cb-linen py-12 px-4">
        <p className="text-sm text-cb-muted-fg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cb-linen py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center text-center">
          <Image src={images.logoURL} alt="CozyBerries" width={64} height={64} className="h-16 w-16" />
          <h1 className="mt-4 text-3xl font-light text-cb-fg">Verify your number</h1>
          <p className="mt-2 text-sm text-cb-muted-fg">
            We&apos;ve sent a {CODE_LENGTH}-digit code to <span className="font-bold text-cb-fg">+91 {phone}</span>
          </p>
        </div>

        <form
          className="mt-8 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerify();
          }}
        >
          <div className="flex justify-center gap-3">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={loading}
                aria-label={`Digit ${index + 1}`}
                className="h-16 w-16 rounded-xl border-none bg-white text-center text-xl font-semibold text-cb-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-cb-terracotta disabled:opacity-50"
              />
            ))}
          </div>

          <p className="text-center text-sm text-cb-muted-fg">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendLoading || loading}
              className="font-semibold text-cb-terracotta-deep hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? "Sending..." : "Resend code"}
            </button>
          </p>

          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}
          {resendSuccess && (
            <p className="text-sm text-cb-success text-center" role="status">
              {resendSuccess}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || code.length !== CODE_LENGTH}
            className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? "Verifying..." : "Verify & log in"}
          </Button>

          <button
            type="button"
            onClick={() => router.push(intent === "register" ? "/signup" : "/login")}
            className="flex w-full items-center justify-center gap-1 text-sm font-semibold text-cb-fg"
          >
            <ChevronLeft className="h-4 w-4" />
            Change number
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-cb-muted-fg">
          By continuing you agree to CozyBerries&apos; Terms of Use and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
