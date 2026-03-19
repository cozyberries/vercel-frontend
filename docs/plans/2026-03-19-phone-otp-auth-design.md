# Phone OTP Auth — Design Document

**Date:** 2026-03-19  
**Branch:** feature/verifynow-phone-otp-auth  
**Status:** Approved

---

## 1. Overview

Signup and login with OTP via VerifyNow (SMS and WhatsApp), with Supabase as the session store. One account can be accessed by email/password, Google, or phone OTP. Phone-only users get a placeholder email; email can be added later on profile (optional).

---

## 2. Decisions

| Topic | Decision |
|-------|----------|
| Identity for phone-only users | Placeholder email (e.g. `phone+91XXXXXXXXXX@phone.cozyburry.local`). Email optional later on profile. |
| Country code | Fixed India (91). |
| OTP channels | SMS and WhatsApp (user chooses; `flowType` SMS or WHATSAPP). |
| Account linking | One account, two ways in: login with phone logs into existing account if phone is on profile. |
| Session creation | Redirect-based: server sets session via `/auth/phone/callback` and `verifyOtp`. |

---

## 3. Routes

| Route | Purpose |
|-------|--------|
| `/register/phone` | Enter phone, choose SMS/WhatsApp, request OTP (register). |
| `/register/verify` | Enter OTP; submit → API validates, creates user if new, returns redirect URL. |
| `/login/phone` | Enter phone, choose SMS/WhatsApp, request OTP (login). |
| `/login/verify` | Enter OTP; submit → API validates, finds or creates user, returns redirect URL. |
| `/auth/phone/callback` | Server: verifyOtp, set session cookies, redirect to `redirect` or `/profile`. |

---

## 4. API Layer

**Env (server-only):** `VERIFYNOW_CUSTOMER_ID`, `VERIFYNOW_KEY` (Base64), optional `VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN`.

**VerifyNow:** Base URL `https://cpaas.messagecentral.com`. Token → Send OTP → Validate OTP. Country 91; flowType SMS or WHATSAPP.

**App API routes:**
- **POST `/api/auth/verifynow/send`** — Body: `{ phone, flowType, intent }`. Rate limit per phone (e.g. 5/15 min). Returns `{ verificationId }`.
- **POST `/api/auth/verifynow/verify`** — Body: `{ verificationId, code, flowType, intent, phone }`. On success: lookup or create user, generate magic link, return `{ redirectUrl }` to `/auth/phone/callback?token_hash=...&redirect=...`.

---

## 5. Supabase Model

- Phone-only users: `auth.users` with placeholder email; no email confirmation. `profiles` and `user_profiles` with `phone` and default name.
- Lookup by phone returns at most one user; that user may have been created by email signup or phone OTP.
- Magic link generated with Admin `generateLink({ type: 'magiclink', email })` (user’s email or placeholder).

---

## 6. Callback

**GET `/auth/phone/callback`** — Query: `token_hash`, optional `redirect`. Server `verifyOtp({ token_hash, type: 'email' })`, then redirect with same `isSafeRedirect` rules as existing `/auth/callback`. Clear `auth_redirect` cookie.

---

## 7. UI

- Phone screens: phone input (10 digits), SMS/WhatsApp choice, “Send OTP” → store verificationId + phone, go to verify.
- Verify screens: OTP input, “Verify” → POST verify, then `location.href = redirectUrl`. Resend OTP reuses send API. Missing context → redirect back to phone step.
- Login verify: if “No account with this number”, show message and link to `/register/phone`.
- `/register` and `/login`: add “Use phone instead” linking to `/register/phone` and `/login/phone`.

---

## 8. Error Handling & Rate Limiting

- Map VerifyNow codes to user messages (e.g. 702 wrong OTP, 705 expired, 800 max limit). Log server-side only.
- Rate limit send OTP: e.g. Upstash `otp_send:{phone}` 5 per 15 min; optional per-IP cap.

---

## 9. Security

- VerifyNow credentials server-only. Redirect safety via existing `isSafeRedirect`. Callback allowed in middleware; no token in client JS.

---

## 10. Implementation Plan

See: `docs/plans/2026-03-19-phone-otp-auth.md`.
