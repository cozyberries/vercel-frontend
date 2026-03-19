"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const OTP_VERIFICATION_ID_KEY = "otp_verification_id";
const OTP_PHONE_KEY = "otp_phone";
const OTP_FLOW_TYPE_KEY = "otp_flow_type";
const OTP_AUTH_TOKEN_KEY = "otp_auth_token";

type FlowType = "SMS" | "WHATSAPP";

export default function RegisterVerifyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [phone, setPhone] = useState("");
  const [flowType, setFlowType] = useState<FlowType>("SMS");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");

  useEffect(() => {
    const storedId = sessionStorage.getItem(OTP_VERIFICATION_ID_KEY);
    const storedPhone = sessionStorage.getItem(OTP_PHONE_KEY);
    const storedFlow = sessionStorage.getItem(OTP_FLOW_TYPE_KEY) as FlowType | null;

    if (!storedId?.trim() || !storedPhone?.trim() || !storedFlow) {
      router.replace("/register/phone");
      return;
    }
    if (storedFlow !== "SMS" && storedFlow !== "WHATSAPP") {
      router.replace("/register/phone");
      return;
    }
    setVerificationId(storedId.trim());
    setPhone(storedPhone.trim());
    setFlowType(storedFlow);
    setReady(true);
  }, [router]);

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
      const authToken = sessionStorage.getItem(OTP_AUTH_TOKEN_KEY);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers.authToken = authToken;
      const res = await fetch("/api/auth/verifynow/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({
          verificationId,
          code: trimmedCode,
          flowType,
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
        sessionStorage.removeItem(OTP_FLOW_TYPE_KEY);
        sessionStorage.removeItem(OTP_AUTH_TOKEN_KEY);
        window.location.href = redirectUrl;
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
          flowType,
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

      const { verificationId: newVerificationId, authToken: newAuthToken } = data;
      if (newVerificationId) {
        sessionStorage.setItem(OTP_VERIFICATION_ID_KEY, newVerificationId);
        setVerificationId(newVerificationId);
      }
      if (newAuthToken) sessionStorage.setItem(OTP_AUTH_TOKEN_KEY, newAuthToken);
      setResendSuccess("OTP sent again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

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
