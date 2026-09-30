# Admin shell and redesign — design

**Date:** 2026-09-30
**Status:** approved in brainstorm, awaiting spec review
**Branch:** `feature/admin-shell-redesign`

## Problem

Admin features were merged into the storefront on 2026-09-28 as four unrelated
pages. Their links are scattered: four rows on `/profile`, five rows in the
hamburger sheet, nothing in the top header. Each page draws its own header,
tabs, loading and error states. There is no admin home. Admins cannot sign in
by mobile number because their Google-created accounts carry no phone. Only a
Supabase Dashboard edit can make someone an admin.

## Goal

One admin section under `/admin` with its own phone-first shell, a component
kit that every current and future admin page is built from, the four existing
pages rebuilt on that kit, a `super_admin`-only page to add and remove admins,
and a way for any signed-in user to attach a verified phone so mobile sign-in
works for admins.

This is piece 1 of a five-piece programme. The later pieces (orders and
revenue dashboard, stock dashboard, customers dashboard, expenses) each get
their own spec and drop into this shell.

## Decisions (approved 2026-09-30)

| Decision | Choice |
|---|---|
| Sign-in | One `/login` for everyone. The role on the account decides access. No separate admin login. |
| Roles | `admin` and `super_admin` see every admin feature. Only `super_admin` can add or remove admins. |
| Chrome | Standalone admin chrome inside `/admin`: the storefront header and bottom nav are replaced. |
| Style | Warm, on-brand: existing `cb-*` tokens and shadcn primitives. |
| Depth | Full rework of the four existing pages now, on a shared kit, so nothing is redone later. |
| Dashboards | Only the action-count tiles ship in this piece. Charts and revenue come in later pieces. |

## Section 1 — Routing, gating and navigation

### Layout gate

`app/admin/layout.tsx` is a server component. It calls `getUser()` and
`isAdmin()` once:

- no session → `redirect("/login?redirect=<pathname>")`
- session but not admin → `redirect("/")` (non-admins must not learn the
  section exists)

It renders `<AdminShell role={role} hasPhone={...}>{children}</AdminShell>`.
The role comes from `user.app_metadata.role` on the server-verified user, never
from the client.

The existing page-level gates on orders, pickups, refills, on-behalf and label
print stay as defence in depth. API routes remain the security boundary via
`requireAdmin()` and the new `requireSuperAdmin()`.

`components/ConditionalLayout.tsx` treats every `/admin` path the way it
treats `/admin/print` today: no site header, no `MobileBottomHeader`.

### AdminShell (`components/admin/AdminShell.tsx`, client)

Phone-first. Three bands:

1. **Top bar.** Wordmark + "Admin", a "Store" link to `/`, and the signed-in
   initials opening a menu with the display name and "Sign out".
2. **Tab row.** Horizontally scrolling on phones, one static row on desktop:
   Dashboard `/admin`, Orders `/admin/orders`, Pickups `/admin/pickup-orders`,
   Refills `/admin/stall-refills`, On-behalf `/admin/on-behalf-orders`,
   Impersonate `/admin/impersonate`, Admins `/admin/admins` (rendered only when
   `role === "super_admin"`). Active tab: exact match for `/admin`, prefix
   match otherwise.
3. **Bottom bar** (phones only, hidden at `lg`): Dashboard, Orders, Pickups,
   Refills.

The label print page keeps its own bare layout: `app/admin/print/layout.tsx`
opts out of the shell by rendering children only. The gate still runs because
the parent layout runs first.

A dismissible banner "Add your phone to sign in by mobile" shows while the
signed-in admin has no `auth.users.phone` (Section 4). Dismissal is stored in
`localStorage` per user id.

### Dashboard home (`/admin`)

Server page inside the shell. Renders a `StatGrid` of action counts from a new
`GET /api/admin/dashboard/actions` (behind `requireAdmin()`):

| Tile | Query |
|---|---|
| Awaiting ✅ | orders with status `payment_pending` or `verifying_payment` |
| To ship | `fulfilment_method = delivery`, status `payment_confirmed` or `processing`, no `tracking_number` |
| Ready for pickup | `fulfilment_method = pickup`, status `ready_for_pickup` |
| Collected today | pickup orders whose latest `collected` event is today IST (reuse `collectedAt()`) |

Each tile links to the matching page and filter. The route is cached in Redis
for 60 s under `admin:dashboard:actions`, invalidated by the orders PATCH and
pickups PATCH routes, so a stall phone refreshing the home does not add
Supabase load. Charts and revenue arrive in later pieces and slot in below the
grid.

### Storefront entry points

Exactly one "Admin" entry each, shown only when `isAdmin`:

- `components/header.tsx`: a shield icon linking to `/admin`, next to the
  profile icon.
- `app/profile/page.tsx`: the "Admin" block becomes one row, "Open admin".
- `components/HamburgerSheet.tsx`: the admin group becomes one `MenuItem`.

The four scattered links and `UserPickerModal` usages in those files go.

### Impersonation

`/admin/impersonate` hosts the current user picker as a page (Section 3).
Starting impersonation behaves as today: the admin lands in the storefront as
the customer with the impersonation banner. "Exit" in the banner returns to
`/admin/on-behalf-orders` instead of reloading the current page.

## Section 2 — Admin component kit

Location: `components/admin/kit/`. Each component is small, typed, built on
shadcn primitives and `cb-*` tokens, phone-first, and has a vitest render
test. Pages use the kit for these patterns instead of importing shadcn
primitives directly.

| Component | Purpose |
|---|---|
| `PageHeader` | Title, optional subtitle, right-hand slot (date, action). Sticky under the tab row on phones. |
| `StatTile`, `StatGrid` | Label, large number, optional delta and href. 2 columns on phones, 4 at `lg`. |
| `SegmentedTabs` | In-page tabs with optional counts. `role="tablist"`, keyboard navigable. |
| `ListCard` | Name line, meta line, `StatusPill`, optional full-width action row. |
| `StatusPill` | One mapping from `OrderStatus` to colour and label, via `lib/utils/order-status.ts`. |
| `FilterChips` | Horizontally scrolling single-select chip groups. |
| `ActionSheet` | Bottom sheet below `lg`, dialog at `lg` and up. Wraps shadcn Sheet and Dialog. |
| `EmptyState` | Icon, title, hint. |
| `LoadingList` | Skeleton `ListCard`s. |
| `ErrorBanner` | Message, Retry button, optional "Log in again" link. |

Tokens: surfaces `cb-cream` / `cb-white`, text `cb-fg` / `cb-muted-fg`,
borders `cb-border`, primary action `cb-fg` on white, accent `cb-terracotta`
for the active bottom-bar item. Status colours stay with `getOrderStatusColor`.

## Section 3 — Page reworks

Every page keeps its API routes, data hooks, refetch intervals and every
action. Only presentation changes. Test ids and selectors used by existing
vitest and Playwright specs are kept so tests are updated, not rewritten.

### Orders (`/admin/orders`)

- `FilterChips` rows replace the two `<select>`s and the day buttons: status,
  delivery / pickup, 7d / 30d / 90d / All. Search box stays.
- Rows become `ListCard`s: order number, customer name, total, `StatusPill`,
  and an AWB hint when shipped.
- Tapping opens `ActionSheet` with the existing status / tracking number /
  delivery-notes form, Save, create and cancel shipment, the label print link
  and the tracking panel. The id-keyed resync and the "nothing to update"
  guard stay.
- The Delhivery notifications panel becomes a collapsible section above the
  list with an unread count.

### Pickups (`/admin/pickup-orders`)

- `SegmentedTabs`: Awaiting ✅ / Hand-over / Ready / Collected today, counts on
  every tab. Search stays.
- `ListCard`s with Send bill, Ready and Collected as full-width buttons.
  Awaiting rows get no Ready / Collected buttons, as today.
- WhatsApp links, `bill_url` and the ready message are unchanged.

### Refills (`/admin/stall-refills`)

- Today / Yesterday become `SegmentedTabs` instead of stacked sections.
- Each line keeps the photo, sold and stock-left counts, Refilled, No stock
  left (confirm in `ActionSheet`) and Undo.
- 30 s refetch while visible, `ErrorBanner` with Retry and "Log in again" on
  401.

### On-behalf orders (`/admin/on-behalf-orders`)

- Table at `lg` and up; `ListCard`s below. Pagination stays. Detail opens in
  `ActionSheet`.

### Impersonate (`/admin/impersonate`)

- New page. The contents of `components/admin/UserPickerModal.tsx` (find user,
  create with OTP, impersonate) move into `app/admin/impersonate/
  impersonate-client.tsx` rendered inline, using kit components. The modal is
  deleted once nothing imports it.

## Section 4 — Admin management and mobile sign-in

### Admins page (`/admin/admins`, `super_admin` only)

- Page gate: `getUser()` then `role === "super_admin"`, else `redirect("/admin")`.
- Lists accounts whose `app_metadata.role` is `admin` or `super_admin` as
  `ListCard`s: name, email, phone, role pill, joined date.
- "Add admin" opens an `ActionSheet` with the existing user search
  (`GET /api/admin/users/search`, phone / email / name). Selecting a result and
  confirming promotes them.
- "Remove admin" on an `admin` card demotes after a confirm. Rules: the caller
  cannot remove themselves; `super_admin` cards have no remove button and the
  API refuses to change them. Making a `super_admin` remains a Supabase
  Dashboard action.

API, all behind `requireSuperAdmin()` (new, in `lib/services/admin-gate.ts`,
returns 403 for `admin`):

| Route | Behaviour |
|---|---|
| `GET /api/admin/admins` | Pages through `auth.admin.listUsers` and returns admin and super_admin accounts. |
| `POST /api/admin/admins` `{ user_id }` | 404 unknown user, 409 already admin or super_admin, else `updateUserById(user_id, { app_metadata: { role: "admin" } })`. |
| `DELETE /api/admin/admins/[id]` | 400 own id, 409 target is super_admin or not an admin, else role → `customer`. |

Service role is created only after the gate passes, every write is scoped by
the id acted on, and no new table is added. This is the admin-gated shape in
CLAUDE.md.

Timing: removal is effective on the server at once because `requireAdmin()`
reads the live account through `getUser()`. A newly promoted admin sees the
Admin entry after their next token refresh or sign-in; the success toast says
"They will see Admin after signing in again."

### Attaching a phone (mobile sign-in)

Root cause: phone login looks up `auth.users.phone`; Google-created admin
accounts have none, so `/api/auth/verifynow/send` answers "No account with
this number."

- `app/profile/page.tsx` gains a "Phone number" row: the current number with
  "Change", or "Add phone" when empty. Entering a 10-digit number sends an OTP.
- `POST /api/auth/verifynow/send` and `/verify` accept a third intent, `link`:
  - requires a server-verified session (`getUser()`), else 401
  - the number must not belong to another account (`findUserIdByPhone`), else
    409 "This number is already on another account"
  - existing rate limits apply
  - on verify success, `updateUserById(user.id, { phone })` and return
    `{ ok: true }`; no magic link, no session change
- The admin shell banner (Section 1) links to `/profile#phone`.
- Phone login then works unchanged; `/login?redirect=/admin` lands in the
  shell.

## Section 5 — Errors, offline and testing

### Errors and offline

- `/api/admin/*` is network-only in the service worker. A failed fetch shows
  `ErrorBanner` with Retry above the last good list.
- A 401 from any admin API shows "Log in again" linking to
  `/login?redirect=<current path>`.
- Admin management and phone linking return the specific messages above and
  never fall through to a generic error.

### Tests

Vitest:

- every kit component
- `app/admin/layout.tsx` gate: signed out, customer, admin, super_admin
- `AdminShell`: active tab by pathname, Admins tab only for super_admin,
  bottom bar items, phone banner shown / dismissed
- `ConditionalLayout` hides site chrome on `/admin/*`
- header, profile and hamburger render one Admin entry for admins and none
  for customers
- `requireSuperAdmin()`
- the three admins routes: 401 / 403, self-removal 400, super_admin 409,
  already-admin 409, success writes the exact role
- `link` intent on send and verify: 401 without session, 409 number in use,
  success sets phone on the caller only
- `GET /api/admin/dashboard/actions`: counts and cache key
- updated page tests: orders, pickups, refills, on-behalf, label print,
  impersonate

Playwright: `tests/admin-shell.spec.ts` at phone width (375×812). Signs in as
`TEST_ADMIN_EMAIL`, opens `/admin`, walks every tab and checks the page
header, then checks a customer session is redirected off `/admin`. Skipped
when the admin credentials are unset, like the other e2e specs.

No migration, so `db:lint` and `db:probe` are unaffected.

## Out of scope

- Charts, revenue, stock and customer dashboards (pieces 2 to 4).
- Expenses entry and reporting (piece 5).
- Product and customer management.
- Making a `super_admin` from the UI.
- Any change to the Telegram ✅ flow or payment confirmation rules.

## Files

New: `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/print/layout.tsx`,
`app/admin/impersonate/page.tsx` + client, `app/admin/admins/page.tsx` + client,
`app/api/admin/admins/route.ts`, `app/api/admin/admins/[id]/route.ts`,
`app/api/admin/dashboard/actions/route.ts`, `components/admin/AdminShell.tsx`,
`components/admin/kit/*`, `tests/admin-shell.spec.ts`.

Changed: `components/ConditionalLayout.tsx`, `components/header.tsx`,
`components/HamburgerSheet.tsx`, `app/profile/page.tsx`,
`components/impersonation-banner.tsx`, `lib/services/admin-gate.ts`,
`app/api/auth/verifynow/send/route.ts`, `app/api/auth/verifynow/verify/route.ts`,
the four admin page clients and their tests, `CLAUDE.md` (route list, admin
section).

Deleted: `components/admin/UserPickerModal.tsx`.
