# Why confirmation emails aren’t sent (Supabase)

Supabase only sends auth emails (signup confirmation, magic link, etc.) when the conditions below are met. If users don’t get the email, go through this list in the **Supabase Dashboard**.

---

## 1. Default SMTP only sends to **team members**

**This is the most common reason.**

Without custom SMTP, Supabase sends auth emails **only to addresses that are in your project’s organization team**.

- **Where to check:** [Organization Settings → Team](https://supabase.com/dashboard/org/_/team)
- **Fix for testing:** Add the email you’re signing up with (e.g. `you@example.com`) as a **member** of the org. Then try signup again — the confirmation email should be sent to that address.
- **Fix for production:** Use **custom SMTP** (step 2) so any user email can receive messages.

---

## 2. Use custom SMTP for real users

To send to **any** email (not just team members), you must configure a custom SMTP provider.

- **Where:** [Project → Authentication → SMTP](https://supabase.com/dashboard/project/_/auth/smtp)
- **Steps:**
  1. Enable custom SMTP.
  2. Set: SMTP host, port (e.g. 587), user, password, and “From” address (e.g. `no-reply@yourdomain.com`).
  3. Save.

**Providers that work:** Brevo, ZeptoMail, SendGrid, Postmark, AWS SES, Resend, etc. (any SMTP-compatible service).

---

## 3. Confirm email is enabled

- **Where:** [Project → Authentication → Providers → Email](https://supabase.com/dashboard/project/_/auth/providers)
- Ensure **“Confirm email”** is **ON** if you want users to receive a confirmation link before signing in.

---

## 4. Redirect URLs

The link in the email will redirect to your app. That URL must be allowed:

- **Where:** [Project → Authentication → URL Configuration → Redirect URLs](https://supabase.com/dashboard/project/_/auth/url-configuration)
- **Add (for local):** `http://localhost:3000/auth/callback`
- **Add (for production):** `https://yourdomain.com/auth/callback`

---

## 5. Check Auth logs if it still fails

- **Where:** [Project → Logs → Auth](https://supabase.com/dashboard/project/_/logs/auth-logs)
- Look for errors like `Email address not authorized` (means default SMTP + non-team email) or SMTP/sending errors.

---

## Quick summary

| Goal | Action |
|------|--------|
| Test with your own email only | Add your email as org team member (no SMTP needed). |
| Send to any user (production) | Configure custom SMTP in Auth → SMTP. |
| Emails still not arriving | Confirm “Confirm email” is ON, redirect URLs include your app, and check Auth logs. |
