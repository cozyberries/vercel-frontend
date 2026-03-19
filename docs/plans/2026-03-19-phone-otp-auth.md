# Phone OTP Auth (VerifyNow + Supabase) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add signup and login with phone OTP via VerifyNow (SMS and WhatsApp), create or find Supabase user, and set session via server-side callback redirect.

**Architecture:** Client routes collect phone and OTP; app API routes call VerifyNow (token, send, validate), then lookup/create user and generate Supabase magic link; client redirects to `/auth/phone/callback` which runs `verifyOtp` and sets session cookies. One account can be accessed by email, Google, or phone.

**Tech Stack:** Next.js 15 App Router, VerifyNow REST API, Supabase Auth (admin generateLink + verifyOtp), Upstash rate limit, existing PhoneInput/validation.

---

## Task 1: Env and VerifyNow client helper

**Files:**
- Create: `lib/verifynow.ts`
- Modify: `.env.example`

**Step 1: Add env vars to .env.example**

Append:

```
# VerifyNow OTP (server-only)
VERIFYNOW_CUSTOMER_ID=
VERIFYNOW_KEY=
VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN=phone.cozyburry.local
```

**Step 2: Create VerifyNow client**

Create `lib/verifynow.ts` with:
- `getAuthToken()`: GET `https://cpaas.messagecentral.com/auth/v1/authentication/token?customerId=&key=&scope=NEW&country=91`, return `data.authToken` or throw.
- `sendOtp(authToken, mobileNumber, flowType: 'SMS'|'WHATSAPP')`: POST `/verification/v3/send` with `countryCode=91`, return `{ verificationId }`.
- `validateOtp(authToken, verificationId, code, flowType)`: POST `/verification/v3/validateOtp` with query params, return success or throw with response code.
- Use env `VERIFYNOW_CUSTOMER_ID`, `VERIFYNOW_KEY`. Normalize mobile to digits only before send.

**Step 3: Commit**

```bash
git add .env.example lib/verifynow.ts
git commit -m "chore: add VerifyNow env and client helper"
```

---

## Task 2: API route — send OTP

**Files:**
- Create: `app/api/auth/verifynow/send/route.ts`

**Step 1: Implement POST send**

- Parse body: `{ phone, flowType, intent }`. Validate `flowType in ['SMS','WHATSAPP']`, `intent in ['register','login']`, phone 10 digits (normalize with replace(/\D/g,'')).
- Rate limit: Upstash key `otp_send:{normalizedPhone}`, 5 per 900 (15 min). Return 429 with message if exceeded.
- Call `getAuthToken()` then `sendOtp(token, normalizedPhone, flowType)`. Return `{ verificationId }` (and optionally `timeout: 60`). On VerifyNow error, map codes (e.g. 511, 800) to 4xx/5xx and user-facing message.
- No auth required (unauthenticated flow).

**Step 2: Commit**

```bash
git add app/api/auth/verifynow/send/route.ts
git commit -m "feat(auth): add VerifyNow send OTP API"
```

---

## Task 3: Supabase user lookup/create helper

**Files:**
- Create: `lib/auth-phone.ts`

**Step 1: Implement helpers**

- `findUserIdByPhone(phone: string)`: Admin Supabase; query `profiles` (or table that has `id`, `phone`) by `phone` (digits); return `{ userId, email }` or null. Use `createAdminSupabaseClient()`.
- `createPhoneUser(phone: string)`: Admin Supabase. Placeholder email = `phone+91${phone}@${process.env.VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN || 'phone.cozyburry.local'}`. `auth.admin.createUser({ email, email_confirm: true })`. Then upsert `profiles` and `user_profiles` with `id`, `phone`, default `full_name` (e.g. "User"). Return `{ userId, email: placeholderEmail }`.
- Handle duplicate email (user already exists): if createUser fails with duplicate, try find by phone and return that user.

**Step 2: Commit**

```bash
git add lib/auth-phone.ts
git commit -m "feat(auth): add phone user lookup and create helpers"
```

---

## Task 4: API route — verify OTP and return redirect URL

**Files:**
- Create: `app/api/auth/verifynow/verify/route.ts`

**Step 1: Implement POST verify**

- Parse body: `{ verificationId, code, flowType, intent, phone }`. Validate required fields and flowType.
- Call `getAuthToken()` then `validateOtp(token, verificationId, code, flowType)`. On failure return 400 with message (e.g. wrong OTP, expired).
- Normalize phone. Call `findUserIdByPhone(phone)`.
- If found: use `userId` and that user’s email (from auth.users or profile) for magic link.
- If not found and intent `login`: return 404 "No account with this number. Please register first."
- If not found and intent `register`: call `createPhoneUser(phone)` to get `userId` and email.
- Generate magic link: `admin.auth.admin.generateLink({ type: 'magiclink', email })`. Get `hashed_token` from response (or equivalent; see Supabase docs). Build origin from request (e.g. `NEXT_PUBLIC_SITE_URL` or host header). Safe redirect from cookie/body `redirect` param using existing `isSafeRedirect` logic.
- Return `{ redirectUrl: `${origin}/auth/phone/callback?token_hash=${hashed_token}&redirect=${encodeURIComponent(redirect)}` }`.

**Step 2: Commit**

```bash
git add app/api/auth/verifynow/verify/route.ts
git commit -m "feat(auth): add VerifyNow verify API and redirect URL"
```

---

## Task 5: Callback route — set session

**Files:**
- Create: `app/auth/phone/callback/route.ts`

**Step 1: Implement GET callback**

- Read query `token_hash`, `redirect`. If no token_hash, redirect to `/login?error=phone_callback_error`.
- Create Supabase server client (same as existing auth callback). Call `supabase.auth.verifyOtp({ token_hash, type: 'email' })`. On error redirect to `/login?error=phone_callback_error` and preserve `redirect` if safe.
- On success, clear `auth_redirect` cookie, then redirect to `redirect` if safe else `/profile`. Use same `getBaseUrl` and `isSafeRedirect` pattern as `app/auth/callback/route.ts`.

**Step 2: Commit**

```bash
git add app/auth/phone/callback/route.ts
git commit -m "feat(auth): add phone OTP callback route"
```

---

## Task 6: Register phone page

**Files:**
- Create: `app/register/phone/page.tsx`
- Create: `app/register/verify/page.tsx` (or shared verify component used by both)

**Step 1: Register phone page**

- Client component. State: phone, flowType (SMS | WhatsApp), loading, error. Use existing `PhoneInput` or 10-digit input; two buttons or radio for "Send via SMS" / "Send via WhatsApp". "Send OTP" → POST `/api/auth/verifynow/send` with `{ phone: digits, flowType, intent: 'register' }`. On success store `verificationId` and `phone` in sessionStorage (or state + pass via router), navigate to `/register/verify`. Show rate limit / API errors.

**Step 2: Commit**

```bash
git add app/register/phone/page.tsx
git commit -m "feat(auth): add register/phone page"
```

---

## Task 7: Register verify page

**Files:**
- Create: `app/register/verify/page.tsx`

**Step 1: Register verify page**

- Client component. Read verificationId and phone from sessionStorage (or searchParams if passed). If missing, redirect to `/register/phone`. OTP input (4–6 digits). "Verify" → POST `/api/auth/verifynow/verify` with `{ verificationId, code, flowType, intent: 'register', phone }`. On success set `window.location.href = data.redirectUrl`. "Resend OTP" → send again with same phone/flowType from storage, then show success message. Handle "No account" (should not happen on register) and wrong/expired OTP.

**Step 2: Commit**

```bash
git add app/register/verify/page.tsx
git commit -m "feat(auth): add register/verify page"
```

---

## Task 8: Login phone and verify pages

**Files:**
- Create: `app/login/phone/page.tsx`
- Create: `app/login/verify/page.tsx`

**Step 1: Login phone page**

- Same as register/phone but intent `'login'`. Store verificationId/phone, navigate to `/login/verify`. Link back to `/login`.

**Step 2: Login verify page**

- Same as register/verify but intent `'login'`. On API 404 "No account with this number", show message and link to `/register/phone`. Otherwise same flow: redirect to `data.redirectUrl` on success.

**Step 3: Commit**

```bash
git add app/login/phone/page.tsx app/login/verify/page.tsx
git commit -m "feat(auth): add login/phone and login/verify pages"
```

---

## Task 9: Links from main register and login

**Files:**
- Modify: `app/register/page.tsx`
- Modify: `app/login/page.tsx`

**Step 1: Add "Use phone instead"**

- On register page: add link "Use phone instead" → `/register/phone` (preserve redirect query if present).
- On login page: add link "Use phone instead" → `/login/phone` (preserve redirect query if present).

**Step 2: Commit**

```bash
git add app/register/page.tsx app/login/page.tsx
git commit -m "feat(auth): link register/login to phone OTP flows"
```

---

## Task 10: Middleware and redirect cookie

**Files:**
- Modify: `middleware.ts` (if needed)
- Verify: `app/auth/phone/callback/route.ts` reads/sets `auth_redirect` cookie for post-login redirect

**Step 1: Ensure callback is not protected**

- Confirm `/auth/phone/callback` is not in protected list; no change if matcher already allows it.

**Step 2: Optional — set auth_redirect on phone pages**

- On `/register/phone` and `/login/phone`, if searchParam `redirect` is present and safe, set cookie `auth_redirect` so verify API and callback can use it. Align with existing `/login` cookie behavior.

**Step 3: Commit**

```bash
git add middleware.ts
git commit -m "chore(auth): ensure phone callback allowed; optional auth_redirect"
```

---

## Task 11: Error code mapping and tests

**Files:**
- Modify: `lib/verifynow.ts` or `app/api/auth/verifynow/send/route.ts`, `verify/route.ts`
- Create: (optional) `__tests__/verifynow.test.ts` or manual test checklist in doc

**Step 1: Map VerifyNow response codes**

- 702 → "Wrong OTP"; 705 → "OTP expired. Request a new one"; 800 → "Too many attempts. Try again later."; 501, 505, 506, 511 → generic "Something went wrong. Please try again." Return appropriate status codes (4xx/5xx).

**Step 2: Commit**

```bash
git add lib/verifynow.ts app/api/auth/verifynow/send/route.ts app/api/auth/verifynow/verify/route.ts
git commit -m "fix(auth): map VerifyNow error codes to user messages"
```

---

## Execution

After completing the plan:

1. Run `npm run build` and fix any type/lint errors.
2. Manually test: register with phone (SMS then WhatsApp), login with same phone, then login with email for same account if linked.
3. Optionally add E2E test for phone OTP flow (mock VerifyNow or use test credentials).

---

**Plan complete.** Use **executing-plans** to implement task-by-task, or run in a dedicated worktree with subagent-driven development for per-task review.
