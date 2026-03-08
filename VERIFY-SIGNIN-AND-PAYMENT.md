# Manual verification: Sign-in and payment changes

**App URL (local):** http://localhost:3000

---

## 1. Sign-in (post-login redirect stays on localhost)

- [ ] Open **http://localhost:3000/login**
- [ ] Sign in with **email/password** → you should land on **http://localhost:3000/profile** (not prod).
- [ ] Sign out, then click **Continue with Google**:
  - [ ] After Google auth you should land on **http://localhost:3000/** or **http://localhost:3000/complete-profile** (URL bar must show `localhost:3000`, not `api.cozyberries.in`).
- **If Google redirects to prod:** In Supabase Dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**, add: `http://localhost:3000/auth/callback`

---

## 2. Payment page (session flow after checkout)

- [ ] Add a product to cart, go to **Checkout**, fill address and click **Pay ₹…**
- [ ] You should land on **http://localhost:3000/payment/session/…**
- [ ] **Static QR:** One QR image is shown (Cloudinary static image), not a loading spinner then dynamic QR.
- [ ] **Pay via UPI ID:** Section shows UPI ID with a **Copy** button (e.g. `aaminarummana-1@okaxis`).
- [ ] **Pay via Phone Number:** Section shows phone number with **Copy** (e.g. `7305500796`).
- [ ] **Steps:** A numbered “How to complete your payment” section with:
  - Step 1: Open any UPI app + link “Tap to open a payment app” (general `upi://pay` link).
  - Step 2: Choose pay by UPI ID or phone number.
  - Step 3: Enter total amount (your order total shown).
  - Step 4: Select your bank and pay.
- [ ] **I Have Paid** → confirmation prompt → **Yes, I have paid** → order confirmation / success state.

---

## Quick links

| What              | URL                          |
|-------------------|------------------------------|
| Home              | http://localhost:3000        |
| Login             | http://localhost:3000/login   |
| Checkout (cart)   | http://localhost:3000/checkout |

After you finish, you can delete this file: `VERIFY-SIGNIN-AND-PAYMENT.md`
