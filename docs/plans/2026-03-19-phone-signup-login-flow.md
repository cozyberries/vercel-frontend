# Phone signup / login — intended flow

## What should happen

### 1. Register (signup) with phone + OTP

1. User enters phone on `/register/phone` → receives SMS OTP.
2. User enters OTP on `/register/verify` → backend validates OTP.
3. **User is created in Supabase:**
   - Auth user with placeholder email: `phone+91XXXXXXXXXX@<VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN>`.
   - Row in `profiles`: `id`, `phone` (10 digits), `full_name: "User"`.
   - Row in `user_profiles`: `id`, `full_name: "User"`, `role: "customer"`.
4. Backend generates a one-time magic link for that email and returns `redirectUrl` to `/auth/phone/callback?token_hash=...&redirect=/profile`.
5. Browser goes to callback → Supabase `verifyOtp` sets the session (cookies) → redirect to `/profile`.
6. **Profile page** loads and shows user information (phone, full name "User"). User can edit name and add addresses. Middleware sees `profiles.phone` set, so no redirect to complete-profile.

### 2. Later: login with phone + OTP (existing user)

1. User enters phone on `/login/phone` → receives SMS OTP.
2. User enters OTP on `/login/verify` → backend validates OTP.
3. Backend finds existing user by phone (`findUserIdByPhone`) → gets their email (placeholder or real).
4. If no user: returns 404 "No account with this number. Please register first."
5. If user exists: same as above — generate magic link, return `redirectUrl` → callback → session set → redirect to `/profile`.
6. **Profile page** shows the same user information; they are logged in.

### 3. Profile page and user information

- Profile is loaded via `useProfile(user)` → `getProfileCombined()` → `/api/profile/combined`.
- That API uses the current session (`supabase.auth.getUser()`) and fetches from `profiles` (and addresses). So it returns `full_name`, `phone`, `email` for the logged-in user.
- Phone-registered users have `profiles.phone` and `profiles.full_name` set at creation, so the profile page shows their phone and name; they can update name and add addresses.

## Where this is implemented

| Step | Location |
|------|----------|
| Create user in Supabase (auth + profiles + user_profiles) | `lib/auth-phone.ts` → `createPhoneUser()` |
| Find existing user by phone | `lib/auth-phone.ts` → `findUserIdByPhone()` |
| Verify OTP, then create/find user, generate link, return redirectUrl | `app/api/auth/verifynow/verify/route.ts` |
| Callback: set session, redirect to /profile | `app/auth/phone/callback/route.ts` |
| Profile page: show user info | `app/profile/page.tsx` + `hooks/useProfile.ts` + `app/api/profile/combined/route.ts` |
| Middleware: allow /profile when phone on file | `middleware.ts` (checks `profiles.phone`) |

## Summary

- **Register**: User is created in Supabase; after verify they land on profile with their info shown.
- **Login**: Existing user is found by phone; after verify they land on profile with their info shown.
- **Profile**: Shows user information from `profiles` (phone, full_name) and allows editing; phone users are not forced to complete-profile because `profiles.phone` is already set.
