"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/supabase-auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { sendActivity } from "@/lib/utils/activities";
import {
  validateEmail,
  validateRequiredPhoneNumber,
  validateSignupPassword,
} from "@/lib/utils/validation";
import PhoneInput from "@/components/PhoneInput";

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\"))
    return false;
  const pathWithoutQuery = path.split("?")[0];
  if (pathWithoutQuery.includes(":")) return false;
  return true;
}

export default function RegisterEmailPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { user, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const phoneHref = isSafeRedirect(redirectTo)
    ? `/register/phone?redirect=${encodeURIComponent(redirectTo)}`
    : "/register/phone";
  const loginEmailHref = isSafeRedirect(redirectTo)
    ? `/login/email?redirect=${encodeURIComponent(redirectTo)}`
    : "/login/email";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setMessage("");
    setEmailError("");
    setPhoneError("");
    setPasswordError("");

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.error || "Invalid email");
      setIsLoading(false);
      return;
    }

    const passwordValidation = validateSignupPassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.error || "Invalid password");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    const phoneValidation = validateRequiredPhoneNumber(phone);
    if (!phoneValidation.isValid) {
      setPhoneError(phoneValidation.error || "Invalid phone number");
      setIsLoading(false);
      return;
    }

    const { error } = await signUp(email.trim(), password, phone.replace(/\D/g, ""));
    if (error) {
      setError(error.message);
      await sendActivity("user_registration_failed", `User ${email} registration failed`, email);
    } else {
      if (isSafeRedirect(redirectTo)) {
        document.cookie = `auth_redirect=${encodeURIComponent(redirectTo)}; path=/; max-age=3600; SameSite=Lax`;
      }
      setMessage("Check your email for a confirmation link!");
      await sendActivity("user_registered_success", `User ${email} registered successfully`, email);
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError("");
    setMessage("");
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
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{" "}
            <Link href={loginEmailHref} className="font-medium text-primary hover:text-primary/80">
              sign in to your existing account
            </Link>
            {" · "}
            <Link href={phoneHref} className="font-medium text-primary hover:text-primary/80">
              use phone instead
            </Link>
          </p>
        </div>
        <div className="mt-8 space-y-3">
          <Button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isLoading}
            variant="outline"
            className="w-full"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            {isGoogleLoading
              ? "Signing in with Google..."
              : "Continue with Google"}
          </Button>
          <Button className="w-full" asChild>
            <Link
              href={phoneHref}
              className="inline-flex items-center justify-center gap-2 w-full"
            >
              <Phone className="w-5 h-5" />
              Continue with phone
            </Link>
          </Button>
        </div>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-gray-50 px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                className="mt-1"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "email-error" : undefined}
              />
              {emailError && (
                <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                  {emailError}
                </p>
              )}
            </div>
            <PhoneInput
              value={phone}
              onChange={setPhone}
              error={phoneError}
              onErrorChange={setPhoneError}
            />
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                className="mt-1"
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? "password-error" : undefined}
              />
              {passwordError && (
                <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">
                  {passwordError}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordError) setPasswordError("");
                }}
                className="mt-1"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          {message && (
            <div className="text-green-600 text-sm text-center">{message}</div>
          )}

          <div>
            <Button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="w-full"
            >
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
