# Admin Merge: Order Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the admin app's order management (orders list + status updates, Delhivery shipment/label, Delhivery webhook pipeline) into this storefront repo so the admin app can be deleted.

**Architecture:** New `/admin/orders` and `/admin/print/label/[orderId]` pages follow the existing server-gated admin page pattern (`getUser()` → `isAdmin()` → redirect). New `/api/admin/*` routes use the `requireAdmin()` gate before a service-role client. The Delhivery HTTP client is ported with a lazy config; the webhook pipeline (token-checked intake → `webhook_events` queue → QStash-signed processor → broadcast notification rows) is re-implemented clean-room from the admin app's behavior, minus its `admin_users` dependency. One idempotent migration consolidates the DB objects; a second drops `admin_users`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role via `createAdminSupabaseClient`), TanStack Query v5, shadcn/ui + sonner, Upstash Redis + QStash, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-admin-merge-order-management-design.md`

**Source repo being ported (still on disk during implementation):** `/Users/abdul.azeez/Personal/cozyberries/cozyberries-admin/` — referenced below as `$ADMIN`. It is deleted only at cutover (Task 13 runbook), after this plan ships.

## Global Constraints

- Next.js **15.1.11** App Router: route handlers and pages receive `params: Promise<{ ... }>` and must `await` it.
- **No middleware** exists in this repo; every admin page gates server-side in the page component, every admin API route gates in the handler.
- Admin gate = `requireAdmin()` from `@/lib/services/admin-gate` (or inline `createServerSupabaseClient()` → `auth.getUser()` → `isAdmin()`), then and only then `createAdminSupabaseClient()`.
- The two webhook routes are the exception: no session exists; the `x-delhivery-token` check / QStash signature / internal HMAC **is** the authorisation (CLAUDE.md service-role register gets updated in Task 13).
- DB is **deny-by-default**: new tables are admin/internal tier (RLS enabled + forced, `revoke all ... from public, anon, authenticated`, grants to `service_role` only). Every function sets `search_path`. Run `npm run db:lint` and `npm run db:probe` before merging migrations.
- Do NOT revoke or narrow any existing grant on `public.notifications` — the storefront granted `authenticated` select/insert/update in `20260914030000_rls_deny_by_default.sql`.
- Order **status writes go through the DB unmodified** — `orders_on_status_change` owns stock commit/return and GST invoice numbering. Never duplicate that logic in app code. Surface CHECK-constraint rejections (SQLSTATE `23514`) as 409, not 500.
- Statuses: `payment_pending, verifying_payment, payment_confirmed, processing, ready_for_pickup, collected, shipped, delivered, cancelled, refunded` (`OrderStatus` in `lib/types/order.ts`).
- Env names: keep `DELIVERY_API_KEY` + `DELHIVERY_BASE_URL`; new server-only vars are `DELHIVERY_WAREHOUSE_NAME`, `DELHIVERY_WEBHOOK_TOKEN`, `INTERNAL_JOB_TOKEN`. The admin app's aliases (`DELHIVERY_API_KEY`, `DELHIVERY_API_TOKEN`, `DELHIVERY_API_BASE_URL`) are dead.
- **No env read at module load** for Delhivery config (lazy accessor, like `getJwtSecret()`).
- Do NOT add `import "server-only"` to any file a vitest test imports (the package throws under the node test environment; existing tests avoid it by mocking `@/lib/supabase-server`).
- Free tiers: < 3,000 Redis commands/day, < 1,000 QStash messages/day. Tracking cache TTL 90 s; processor cron 4×/day.
- Nothing under `lib/catalog/` is touched; no `useSearchParams()` in static pages (all new pages are `force-dynamic`, so N/A).
- Vitest: tests are colocated (`route.test.ts` beside `route.ts`, `page.test.tsx` beside `page.tsx`), `npm run test:unit`. Component tests start with `// @vitest-environment jsdom`. Playwright is skipped per standing preference.
- `docs/superpowers/` is gitignored — commit plan/spec/runbook docs with `git add -f`.
- Commit after every task. Do not push or merge until the user says ship.

## Review Focus

1. A webhook POST with an oversized (>1 MB) or malformed body must return 413/400 and insert **no** `webhook_events` row — test pinned in Task 4.
2. A PATCH that sets a pickup-only status on a delivery order (or vice versa) hits the DB CHECK and must come back 409 with the constraint message, never 500 — test pinned in Task 6.
3. Two admins editing the same order: a status change racing another write must 409 (optimistic `.eq("status", current)`) and write **no** audit row and clear no cache — test pinned in Task 6.
4. Cancel succeeds at Delhivery but the order UPDATE fails: the response must report the split state (503, `delhivery_success: true, db_update_success: false`) and leave `tracking_number` intact so a retry can reconcile — test pinned in Task 7.
5. Broadcast notification rows (`user_id IS NULL`) must be invisible to the customer notifications API and unmarkable through the admin route with a customer-owned id — tests pinned in Task 8.

---

### Task 1: Delhivery client library (lazy config)

**Files:**
- Create: `lib/delhivery/config.ts`
- Create: `lib/delhivery/config.test.ts`
- Create: `lib/delhivery/client.ts` (copied from `$ADMIN/lib/delhivery/client.ts`, edited)
- Create: `lib/delhivery/types.ts` (copied from `$ADMIN/lib/delhivery/types.ts`, edited)
- Create: `lib/delhivery/utils.ts`
- Create: `lib/delhivery/utils.test.ts`

**Interfaces:**
- Consumes: nothing (leaf library).
- Produces:
  - `getDelhiveryConfig(): DelhiveryConfig` where `DelhiveryConfig = { baseUrl: string; token: string; warehouseName: string; timeoutMs: number }`
  - `createShipment(payload: CreateShipmentRequest): Promise<DelhiveryResult<CreateShipmentResponse>>`
  - `cancelShipment(waybill: string): Promise<DelhiveryResult<CancelShipmentResponse>>`
  - `getPackingSlip(waybill: string, pdfSize?: "A4" | "4R"): Promise<DelhiveryResult<PackingSlipResponse>>`
  - `getPackingSlipJSON(waybill: string): Promise<DelhiveryResult<PackingSlipRawResponse>>`
  - `type DelhiveryResult<T> = { ok: true; data: T } | { ok: false; error: string; statusCode?: number }`
  - `isDelhiveryOrder(carrierName: string | null | undefined, trackingNumber: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing config test**

```ts
// lib/delhivery/config.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("getDelhiveryConfig", () => {
  it("module import never throws even with empty env (lazy)", async () => {
    vi.stubEnv("DELIVERY_API_KEY", "");
    await expect(import("./config")).resolves.toBeDefined();
  });

  it("throws when DELIVERY_API_KEY is missing", async () => {
    vi.stubEnv("DELIVERY_API_KEY", "");
    const { getDelhiveryConfig } = await import("./config");
    expect(() => getDelhiveryConfig()).toThrow(/DELIVERY_API_KEY/);
  });

  it("trims, strips trailing slash, defaults base url and warehouse", async () => {
    vi.stubEnv("DELIVERY_API_KEY", " tok ");
    vi.stubEnv("DELHIVERY_BASE_URL", "https://track.delhivery.com/");
    vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "");
    const { getDelhiveryConfig } = await import("./config");
    const c = getDelhiveryConfig();
    expect(c).toEqual({
      baseUrl: "https://track.delhivery.com",
      token: "tok",
      warehouseName: "",
      timeoutMs: 15_000,
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run lib/delhivery/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implement the config**

```ts
// lib/delhivery/config.ts
// Lazy accessor — CLAUDE.md forbids env reads at module load (the admin app's
// version threw at import time and broke unrelated builds).

export interface DelhiveryConfig {
  baseUrl: string;
  token: string;
  warehouseName: string;
  timeoutMs: number;
}

export function getDelhiveryConfig(): DelhiveryConfig {
  const token = process.env.DELIVERY_API_KEY?.trim();
  if (!token) {
    throw new Error("Delhivery config missing required env: DELIVERY_API_KEY");
  }
  const baseUrl = (process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com")
    .trim()
    .replace(/\/$/, "");
  return {
    baseUrl,
    token,
    warehouseName: (process.env.DELHIVERY_WAREHOUSE_NAME || "").trim(),
    timeoutMs: 15_000,
  };
}
```

- [ ] **Step 4: Run the config test — expect PASS**

Run: `npx vitest run lib/delhivery/config.test.ts`

- [ ] **Step 5: Copy the client and types from the admin repo**

```bash
mkdir -p lib/delhivery
cp ../cozyberries-admin/lib/delhivery/types.ts lib/delhivery/types.ts
cp ../cozyberries-admin/lib/delhivery/client.ts lib/delhivery/client.ts
```

- [ ] **Step 6: Edit the copied client for the lazy config and drop dead surface**

In `lib/delhivery/client.ts`:

1. Replace the config import:
```ts
// old
import config from "./config";
// new
import { getDelhiveryConfig } from "./config";
```
2. In **each** exported function body, add as the first line:
```ts
const config = getDelhiveryConfig();
```
   (If the file references `config.timeout`, rename usages to `config.timeoutMs`.)
3. Delete the `editShipment` function entirely (the shipment PATCH route is not being ported — spec drops it).
4. In `lib/delhivery/types.ts`, delete `EditShipmentRequest` / `EditShipmentResponse` and any now-unused imports/exports.
5. Run `npx tsc --noEmit 2>&1 | grep delhivery` — expect no errors from these files.

- [ ] **Step 7: Write the failing utils test**

```ts
// lib/delhivery/utils.test.ts
import { describe, it, expect } from "vitest";
import { isDelhiveryOrder } from "./utils";

describe("isDelhiveryOrder", () => {
  it("true when AWB present and carrier empty", () => {
    expect(isDelhiveryOrder(null, "12345")).toBe(true);
  });
  it("true when carrier contains delhivery, any case", () => {
    expect(isDelhiveryOrder("Delhivery Surface", "12345")).toBe(true);
  });
  it("false without an AWB", () => {
    expect(isDelhiveryOrder("Delhivery", null)).toBe(false);
    expect(isDelhiveryOrder("Delhivery", "  ")).toBe(false);
  });
  it("false for another carrier", () => {
    expect(isDelhiveryOrder("BlueDart", "12345")).toBe(false);
  });
});
```

Run: `npx vitest run lib/delhivery/utils.test.ts` — expect FAIL (module missing).

- [ ] **Step 8: Implement utils**

```ts
// lib/delhivery/utils.ts
// Mirrors the admin app's isDelhiveryOrder: an order is trackable/cancellable at
// Delhivery when it has an AWB and the carrier is unset or names Delhivery.
export function isDelhiveryOrder(
  carrierName: string | null | undefined,
  trackingNumber: string | null | undefined
): boolean {
  if (!trackingNumber?.trim()) return false;
  const carrier = (carrierName || "").trim().toLowerCase();
  return carrier === "" || carrier.includes("delhivery");
}
```

- [ ] **Step 9: Run all Task 1 tests — expect PASS**

Run: `npx vitest run lib/delhivery`

- [ ] **Step 10: Commit**

```bash
git add lib/delhivery
git commit -m "feat(delhivery): port Delhivery client with lazy config"
```

---

### Task 2: Database migrations (pipeline consolidation + drop admin_users)

**Files:**
- Create: `supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql`
- Create: `supabase/migrations/20260928110000_drop_admin_users.sql`

**Interfaces:**
- Consumes: live DB objects created by `$ADMIN/database/migrations/` (already applied to the shared Supabase project — every statement here must be idempotent against them).
- Produces: `public.webhook_events` (columns: `id uuid pk, source text, event_type text, awb text, payload jsonb, status text check in pending|processing|processed|failed, attempt_count int, next_retry_at timestamptz, last_error text, received_at, processed_at, created_at, updated_at`), `public.claim_webhook_events(p_batch_size int, p_lease_threshold timestamptz, p_now timestamptz) returns setof webhook_events`, nullable `notifications.user_id`, `orders.carrier_name/estimated_delivery_date/delhivery_latest_status/delhivery_latest_scan_at/delhivery_latest_location`.

- [ ] **Step 1: Write the consolidation migration**

```sql
-- supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql
-- Consolidates the Delhivery webhook pipeline from cozyberries-admin into this
-- repo's migration history (admin-merge spec 2026-09-28). The two apps share one
-- Supabase project, so most objects already exist live; everything here is
-- idempotent.
--
-- Tiers (CLAUDE.md, Database Security Conventions):
--   webhook_events         — Admin/internal: RLS enabled + forced, no grants to
--                            anon/authenticated, no policies, service_role only.
--   claim_webhook_events() — execute for service_role only. Declared with
--                            SET search_path (20260914020000_harden_functions.sql
--                            set it live; CREATE OR REPLACE would silently drop
--                            it, so it is inline here).
--   notifications          — existing table used by the service-role
--                            notifications API. Only relaxed: user_id becomes
--                            nullable (admin broadcast rows use user_id IS NULL).
--                            Grants are NOT touched (authenticated keeps
--                            select/insert/update from rls_deny_by_default).
--   orders                 — shipment summary columns the admin app introduced.

alter table public.orders
  add column if not exists carrier_name text,
  add column if not exists estimated_delivery_date timestamptz,
  add column if not exists delhivery_latest_status text,
  add column if not exists delhivery_latest_scan_at timestamptz,
  add column if not exists delhivery_latest_location text;

create table if not exists public.webhook_events (
  id              uuid        not null default gen_random_uuid() primary key,
  source          text        not null default 'delhivery',
  event_type      text        not null default 'shipment_scan',
  awb             text,
  payload         jsonb       not null,
  status          text        not null default 'pending'
                    check (status in ('pending', 'processing', 'processed', 'failed')),
  attempt_count   int         not null default 0,
  next_retry_at   timestamptz,
  last_error      text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_webhook_events_status_retry
  on public.webhook_events (status, next_retry_at, created_at);
create index if not exists idx_webhook_events_processing_reclaim
  on public.webhook_events (updated_at, created_at, id)
  where status = 'processing';
create index if not exists idx_webhook_events_awb
  on public.webhook_events (awb, created_at desc)
  where awb is not null;

create or replace function public.set_webhook_events_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_webhook_events_updated_at() from public, anon, authenticated;

drop trigger if exists trg_webhook_events_updated_at on public.webhook_events;
drop trigger if exists trg_webhook_events_set_updated_at on public.webhook_events;
create trigger trg_webhook_events_set_updated_at
  before update on public.webhook_events
  for each row execute function public.set_webhook_events_updated_at();

alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
-- Tier style here is no-policies + grants; drop the policy the admin repo created.
drop policy if exists "Service role full access" on public.webhook_events;
revoke all on table public.webhook_events from public, anon, authenticated;
grant all on table public.webhook_events to service_role;

create or replace function public.claim_webhook_events(
  p_batch_size      int,
  p_lease_threshold timestamptz,
  p_now             timestamptz
)
returns setof public.webhook_events
language sql
set search_path = public
as $$
  update public.webhook_events
  set status = 'processing', updated_at = p_now
  where id in (
    select id from public.webhook_events
    where (
      (status = 'pending' and (next_retry_at is null or next_retry_at <= p_now))
      or (status = 'failed' and next_retry_at is not null and next_retry_at <= p_now)
      or (status = 'processing' and updated_at <= p_lease_threshold)
    )
    order by created_at asc
    limit least(greatest(coalesce(p_batch_size, 0), 1), 500)
    for update skip locked
  )
  returning *;
$$;

revoke all on function public.claim_webhook_events(int, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_webhook_events(int, timestamptz, timestamptz)
  to service_role;

-- notifications: broadcast rows for admins carry user_id null. The type check
-- below matches what the admin repo already applied live (drop-and-add is
-- idempotent against it).
alter table public.notifications alter column user_id drop not null;
alter table public.notifications add column if not exists meta jsonb;
create index if not exists idx_notifications_user_read_created
  on public.notifications (user_id, read, created_at desc);
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'info'::text, 'success'::text, 'warning'::text, 'error'::text,
    'order_status'::text, 'payment_status'::text, 'shipping_scan'::text
  ]));
```

- [ ] **Step 2: Write the admin_users drop migration**

```sql
-- supabase/migrations/20260928110000_drop_admin_users.sql
-- The admin app's separate bcrypt login is retired (admin-merge spec
-- 2026-09-28). Admin identity is auth.users.app_metadata.role only; nothing
-- reads admin_users after the merge. APPLY THIS ONLY AT CUTOVER STEP 4 of the
-- runbook (after the merged pipeline is verified in production).
drop table if exists public.admin_users cascade;
```

- [ ] **Step 3: Lint and probe**

Run: `npm run db:lint`
Expected: `ERROR=0`; warnings no worse than the known permanent `duplicate_index` on `sizes`.
Run: `npm run db:probe`
Expected: PASS (reachability assertions all green).
If either fails, fix the migration SQL — do not weaken the probe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql supabase/migrations/20260928110000_drop_admin_users.sql
git commit -m "feat(db): consolidate delhivery webhook pipeline; drop admin_users at cutover"
```

---

### Task 3: Webhook payload parser

**Files:**
- Create: `lib/services/delhivery-webhook.ts`
- Create: `lib/services/delhivery-webhook.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ParsedDelhiveryScan { awb: string; status: string; status_type?: string; status_datetime: string; status_location?: string; instructions?: string }`
  - `interface ParsedDelhiveryPayload { raw_awb: string | null; scans: ParsedDelhiveryScan[] }`
  - `parseDelhiveryWebhookPayload(body: unknown): ParsedDelhiveryPayload | null` — accepts `{ scans: [...] }` or one flat scan object; a scan is valid only with non-empty `AWB`, `Status`, `StatusDateTime`; returns `null` when no valid scan.

- [ ] **Step 1: Write the failing test**

```ts
// lib/services/delhivery-webhook.test.ts
import { describe, it, expect } from "vitest";
import { parseDelhiveryWebhookPayload } from "./delhivery-webhook";

const scan = {
  AWB: "AWB123",
  Status: "In Transit",
  StatusDateTime: "2026-09-28T10:00:00+05:30",
  StatusType: "UD",
  StatusLocation: "Bangalore_Hub",
  Instructions: "Bag added",
};

describe("parseDelhiveryWebhookPayload", () => {
  it("parses a flat single-scan payload", () => {
    const p = parseDelhiveryWebhookPayload(scan);
    expect(p).not.toBeNull();
    expect(p!.raw_awb).toBe("AWB123");
    expect(p!.scans).toEqual([
      {
        awb: "AWB123",
        status: "In Transit",
        status_datetime: "2026-09-28T10:00:00+05:30",
        status_type: "UD",
        status_location: "Bangalore_Hub",
        instructions: "Bag added",
      },
    ]);
  });

  it("parses { scans: [...] } and skips invalid entries", () => {
    const p = parseDelhiveryWebhookPayload({
      scans: [scan, { AWB: "", Status: "x", StatusDateTime: "y" }, { AWB: "B2" }],
    });
    expect(p!.scans).toHaveLength(1);
  });

  it("returns null for a payload with no valid scan", () => {
    expect(parseDelhiveryWebhookPayload({ hello: "world" })).toBeNull();
    expect(parseDelhiveryWebhookPayload(null)).toBeNull();
    expect(parseDelhiveryWebhookPayload({ scans: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './delhivery-webhook'`)

Run: `npx vitest run lib/services/delhivery-webhook.test.ts`

- [ ] **Step 3: Implement the parser**

```ts
// lib/services/delhivery-webhook.ts
// Delhivery shipment-scan webhook payloads arrive either as { scans: [...] }
// or as a single flat scan object with PascalCase keys.

export interface ParsedDelhiveryScan {
  awb: string;
  status: string;
  status_type?: string;
  status_datetime: string;
  status_location?: string;
  instructions?: string;
}

export interface ParsedDelhiveryPayload {
  raw_awb: string | null;
  scans: ParsedDelhiveryScan[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseScan(raw: unknown): ParsedDelhiveryScan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const awb = str(r.AWB);
  const status = str(r.Status);
  const statusDateTime = str(r.StatusDateTime);
  if (!awb || !status || !statusDateTime) return null;
  return {
    awb,
    status,
    status_datetime: statusDateTime,
    status_type: str(r.StatusType),
    status_location: str(r.StatusLocation),
    instructions: str(r.Instructions),
  };
}

export function parseDelhiveryWebhookPayload(body: unknown): ParsedDelhiveryPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const rawScans = Array.isArray(b.scans) ? b.scans : [b];
  const scans = rawScans
    .map(parseScan)
    .filter((s): s is ParsedDelhiveryScan => s !== null);
  if (scans.length === 0) return null;
  return { raw_awb: scans[0].awb, scans };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run lib/services/delhivery-webhook.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/services/delhivery-webhook.ts lib/services/delhivery-webhook.test.ts
git commit -m "feat(shipping): parse Delhivery webhook scan payloads"
```

---

### Task 4: Webhook intake route

**Files:**
- Create: `app/api/webhooks/delhivery/route.ts`
- Create: `app/api/webhooks/delhivery/route.test.ts`

**Interfaces:**
- Consumes: `parseDelhiveryWebhookPayload` (Task 3), `createAdminSupabaseClient` from `@/lib/supabase-server`.
- Produces: `POST /api/webhooks/delhivery` — header `x-delhivery-token` must equal env `DELHIVERY_WEBHOOK_TOKEN` (constant-time). 202 `{ ok: true }` on accepted; 401 bad/missing token; 500 unset env; 400 invalid JSON/no valid scan; 413 body > 1 MB. Inserts one `webhook_events` row `{ source: 'delhivery', event_type: 'shipment_scan', awb, payload, status: 'pending', received_at }`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/webhooks/delhivery/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = { inserted: [] as Record<string, unknown>[], insertError: null as { message: string } | null };
  const admin = {
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        if (state.insertError) return { error: state.insertError };
        state.inserted.push(row);
        return { error: null };
      }),
    })),
  };
  return { state, admin, reset: () => { state.inserted = []; state.insertError = null; } };
});

vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: vi.fn(() => h.admin),
}));

import { POST } from "./route";

const SCAN = { AWB: "AWB1", Status: "In Transit", StatusDateTime: "2026-09-28T10:00:00+05:30" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhooks/delhivery", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  h.reset();
  vi.stubEnv("DELHIVERY_WEBHOOK_TOKEN", "secret-token");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/delhivery", () => {
  it("401 without a token, no insert", async () => {
    const res = await POST(req(SCAN));
    expect(res.status).toBe(401);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("401 on a wrong token", async () => {
    const res = await POST(req(SCAN, { "x-delhivery-token": "nope" }));
    expect(res.status).toBe(401);
  });

  it("500 when DELHIVERY_WEBHOOK_TOKEN is unset", async () => {
    vi.stubEnv("DELHIVERY_WEBHOOK_TOKEN", "");
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(500);
  });

  it("413 when the body exceeds 1MB, no insert", async () => {
    const big = JSON.stringify({ ...SCAN, pad: "x".repeat(1_000_001) });
    const res = await POST(req(big, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(413);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("400 on invalid JSON and on a payload with no valid scan", async () => {
    expect((await POST(req("{not json", { "x-delhivery-token": "secret-token" }))).status).toBe(400);
    expect((await POST(req({ nothing: true }, { "x-delhivery-token": "secret-token" }))).status).toBe(400);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("202 and inserts a pending event on a valid scan", async () => {
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.state.inserted).toHaveLength(1);
    expect(h.state.inserted[0]).toMatchObject({
      source: "delhivery",
      event_type: "shipment_scan",
      awb: "AWB1",
      status: "pending",
    });
  });

  it("500 when the insert fails", async () => {
    h.state.insertError = { message: "boom" };
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run app/api/webhooks/delhivery/route.test.ts`

- [ ] **Step 3: Implement the route**

```ts
// app/api/webhooks/delhivery/route.ts
// Delhivery scan-event intake. No session exists — the x-delhivery-token header
// is the authorisation (see CLAUDE.md service-role register). Events are queued
// into webhook_events; the QStash-scheduled processor turns them into
// notifications. Delhivery retries on non-2xx, so 202 is returned only after a
// successful insert.
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { parseDelhiveryWebhookPayload } from "@/lib/services/delhivery-webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

function tokensMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const expected = process.env.DELHIVERY_WEBHOOK_TOKEN?.trim();
  const provided = request.headers.get("x-delhivery-token")?.trim();
  if (!provided) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }
  if (!expected) {
    return NextResponse.json({ error: "Webhook token not configured" }, { status: 500 });
  }
  if (!tokensMatch(provided, expected)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const declared = parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseDelhiveryWebhookPayload(body);
  if (!parsed) {
    return NextResponse.json({ error: "No valid scan in payload" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("webhook_events").insert({
    source: "delhivery",
    event_type: "shipment_scan",
    awb: parsed.raw_awb,
    payload: body,
    status: "pending",
    received_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[delhivery-webhook] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to queue event" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/api/webhooks/delhivery/route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/delhivery
git commit -m "feat(shipping): Delhivery webhook intake queues scan events"
```

---

### Task 5: Webhook processor + internal process route

**Files:**
- Create: `lib/services/webhook-processor.ts`
- Create: `lib/services/webhook-processor.test.ts`
- Create: `app/api/internal/webhooks/delhivery/process/route.ts`
- Create: `app/api/internal/webhooks/delhivery/process/route.test.ts`

**Interfaces:**
- Consumes: `parseDelhiveryWebhookPayload` (Task 3), `claim_webhook_events` RPC (Task 2), `createAdminSupabaseClient`, `Receiver` from `@upstash/qstash` (already a dependency).
- Produces:
  - `processWebhookEventBatch(): Promise<ProcessResult>` where `ProcessResult = { claimed: number; processed: number; failed: number; skipped: number }`
  - `POST /api/internal/webhooks/delhivery/process` — QStash-signature path (header `upstash-signature`) or internal path (headers `x-internal-job-token`, `x-job-ts`, `x-job-sig`). 200 `{ ok: true, result }`; 401 bad auth; 500 `{ ok: false, error: { code, message } }`.
  - Notification rows: one **broadcast** row per scan: `{ user_id: null, type: 'shipping_scan', read: false, title, message, meta: { awb, scan_status, scan_location?, scan_time, order_id?, order_number? } }`. Column is `meta`, not `metadata`.
  - Difference from the admin app, by design: no `admin_users` recipient lookup (table is being dropped; rows are broadcast anyway) and no 15 s heartbeat (batch ≤ 50 with a 20 s route timeout; the 10-minute lease reclaim in `claim_webhook_events` covers crashes).

- [ ] **Step 1: Write the failing processor tests**

```ts
// lib/services/webhook-processor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    claimed: [] as Row[],
    order: null as Row | null,
    notifications: [] as Row[],
    eventUpdates: [] as { patch: Row; id: unknown }[],
    notifError: null as { message: string } | null,
  };
  const admin = {
    rpc: vi.fn(async () => ({ data: state.claimed, error: null })),
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.order, error: null }) }),
          }),
        };
      if (table === "notifications")
        return {
          insert: async (row: Row) => {
            if (state.notifError) return { error: state.notifError };
            state.notifications.push(row);
            return { error: null };
          },
        };
      if (table === "webhook_events")
        return {
          update: (patch: Row) => ({
            eq: async (_col: string, id: unknown) => {
              state.eventUpdates.push({ patch, id });
              return { error: null };
            },
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return {
    state,
    admin,
    reset: () => {
      state.claimed = [];
      state.order = null;
      state.notifications = [];
      state.eventUpdates = [];
      state.notifError = null;
    },
  };
});

vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { processWebhookEventBatch } from "./webhook-processor";

const SCAN = { AWB: "AWB1", Status: "Delivered", StatusDateTime: "2026-09-28T10:00:00+05:30", StatusLocation: "Bangalore" };
const event = (over: Row = {}): Row => ({
  id: "ev-1",
  payload: SCAN,
  attempt_count: 0,
  ...over,
});

beforeEach(() => h.reset());

describe("processWebhookEventBatch", () => {
  it("inserts a broadcast notification and marks the event processed", async () => {
    h.state.claimed = [event()];
    h.state.order = { id: "o-1", order_number: "ORD-1", user_id: "u-1" };
    const r = await processWebhookEventBatch();
    expect(r).toEqual({ claimed: 1, processed: 1, failed: 0, skipped: 0 });
    expect(h.state.notifications).toHaveLength(1);
    expect(h.state.notifications[0]).toMatchObject({
      user_id: null,
      type: "shipping_scan",
      read: false,
      title: "Shipment scan: Delivered",
    });
    const meta = h.state.notifications[0].meta as Row;
    expect(meta).toMatchObject({ awb: "AWB1", scan_status: "Delivered", order_id: "o-1", order_number: "ORD-1" });
    const done = h.state.eventUpdates.at(-1)!;
    expect(done.id).toBe("ev-1");
    expect(done.patch).toMatchObject({ status: "processed", last_error: null });
  });

  it("keeps an unmatched AWB as a processed event with a WARN in last_error", async () => {
    h.state.claimed = [event()];
    h.state.order = null;
    await processWebhookEventBatch();
    expect(h.state.notifications[0].message).toContain("AWB AWB1");
    expect(h.state.eventUpdates.at(-1)!.patch.last_error).toContain("WARN_UNMATCHED_AWB:AWB1");
  });

  it("marks a scan-less payload processed and counts it skipped", async () => {
    h.state.claimed = [event({ payload: { nothing: true } })];
    const r = await processWebhookEventBatch();
    expect(r).toEqual({ claimed: 1, processed: 1, failed: 0, skipped: 1 });
    expect(h.state.notifications).toHaveLength(0);
  });

  it("schedules a retry on failure and dead-letters at 10 attempts", async () => {
    h.state.notifError = { message: "insert failed" };
    h.state.claimed = [event(), event({ id: "ev-2", attempt_count: 9 })];
    const r = await processWebhookEventBatch();
    expect(r.failed).toBe(2);
    const [first, second] = h.state.eventUpdates.map((u) => u.patch);
    expect(first).toMatchObject({ status: "pending", attempt_count: 1 });
    expect(first.next_retry_at).toBeTruthy();
    expect(second).toMatchObject({ status: "failed", attempt_count: 10, next_retry_at: null });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './webhook-processor'`)

Run: `npx vitest run lib/services/webhook-processor.test.ts`

- [ ] **Step 3: Implement the processor**

```ts
// lib/services/webhook-processor.ts
// Turns queued Delhivery scan events into broadcast admin notifications
// (user_id null). Claiming goes through the claim_webhook_events RPC
// (FOR UPDATE SKIP LOCKED + 10-minute lease reclaim), so concurrent processor
// runs never double-process an event.
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  parseDelhiveryWebhookPayload,
  type ParsedDelhiveryScan,
} from "@/lib/services/delhivery-webhook";

const BATCH_SIZE = 50;
const LEASE_TIMEOUT_MINUTES = 10;
const MAX_ATTEMPTS = 10;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];

export interface ProcessResult {
  claimed: number;
  processed: number;
  failed: number;
  skipped: number;
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
interface ClaimedEvent {
  id: string;
  payload: unknown;
  attempt_count: number;
}

async function createScanNotification(
  admin: AdminClient,
  scan: ParsedDelhiveryScan
): Promise<string | null> {
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, user_id")
    .eq("tracking_number", scan.awb)
    .maybeSingle();

  const when = new Date(scan.status_datetime).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
  const subject = order ? `Order ${order.order_number}` : `AWB ${scan.awb}`;
  const where = scan.status_location ? ` at ${scan.status_location}` : "";

  const { error } = await admin.from("notifications").insert({
    user_id: null,
    type: "shipping_scan",
    read: false,
    title: `Shipment scan: ${scan.status}`,
    message: `${subject}${where} at ${when}`,
    meta: {
      awb: scan.awb,
      scan_status: scan.status,
      ...(scan.status_location ? { scan_location: scan.status_location } : {}),
      scan_time: scan.status_datetime,
      ...(order ? { order_id: order.id, order_number: order.order_number } : {}),
    },
  });
  if (error) throw new Error(`notification insert failed: ${error.message}`);
  return order ? null : `WARN_UNMATCHED_AWB:${scan.awb}`;
}

async function markProcessed(admin: AdminClient, id: string, warning: string | null) {
  await admin
    .from("webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: warning,
    })
    .eq("id", id);
}

async function markFailed(admin: AdminClient, ev: ClaimedEvent, message: string) {
  const attempts = (ev.attempt_count ?? 0) + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  const delayMin =
    RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
  await admin
    .from("webhook_events")
    .update({
      status: dead ? "failed" : "pending",
      attempt_count: attempts,
      next_retry_at: dead ? null : new Date(Date.now() + delayMin * 60_000).toISOString(),
      last_error: message,
    })
    .eq("id", ev.id);
}

export async function processWebhookEventBatch(): Promise<ProcessResult> {
  const admin = createAdminSupabaseClient();
  const now = new Date();
  const { data, error } = await admin.rpc("claim_webhook_events", {
    p_batch_size: BATCH_SIZE,
    p_lease_threshold: new Date(now.getTime() - LEASE_TIMEOUT_MINUTES * 60_000).toISOString(),
    p_now: now.toISOString(),
  });
  if (error) throw new Error(`claim_webhook_events failed: ${error.message}`);

  const events = (data ?? []) as ClaimedEvent[];
  const result: ProcessResult = { claimed: events.length, processed: 0, failed: 0, skipped: 0 };

  for (const ev of events) {
    try {
      const parsed = parseDelhiveryWebhookPayload(ev.payload);
      if (!parsed) {
        await markProcessed(admin, ev.id, null);
        result.processed += 1;
        result.skipped += 1;
        continue;
      }
      const warnings: string[] = [];
      for (const scan of parsed.scans) {
        const warn = await createScanNotification(admin, scan);
        if (warn) warnings.push(warn);
      }
      await markProcessed(admin, ev.id, warnings.length ? warnings.join("; ") : null);
      result.processed += 1;
    } catch (err) {
      await markFailed(admin, ev, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run lib/services/webhook-processor.test.ts`

- [ ] **Step 5: Write the failing route tests**

```ts
// app/api/internal/webhooks/delhivery/process/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const h = vi.hoisted(() => ({
  batch: vi.fn(async () => ({ claimed: 0, processed: 0, failed: 0, skipped: 0 })),
  verify: vi.fn(async () => true),
}));

vi.mock("@/lib/services/webhook-processor", () => ({ processWebhookEventBatch: h.batch }));
vi.mock("@upstash/qstash", () => ({
  Receiver: vi.fn(() => ({ verify: h.verify })),
}));

import { POST } from "./route";

const PATH = "/api/internal/webhooks/delhivery/process";
const TOKEN = "internal-job-token-1234567890abcdef";

function internalReq(over: { ts?: string; sig?: string; token?: string } = {}) {
  const ts = over.ts ?? String(Date.now());
  const sig =
    over.sig ?? createHmac("sha256", TOKEN).update(`${ts}:${PATH}`).digest("hex");
  return new NextRequest(`http://localhost${PATH}`, {
    method: "POST",
    body: "{}",
    headers: {
      "x-internal-job-token": over.token ?? TOKEN,
      "x-job-ts": ts,
      "x-job-sig": sig,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_JOB_TOKEN", TOKEN);
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "cur");
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/webhooks/delhivery/process", () => {
  it("runs the batch on a valid QStash signature", async () => {
    const req = new NextRequest(`http://localhost${PATH}`, {
      method: "POST",
      body: "{}",
      headers: { "upstash-signature": "sig" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(h.verify).toHaveBeenCalled();
    expect(h.batch).toHaveBeenCalled();
  });

  it("401 on a bad QStash signature", async () => {
    h.verify.mockResolvedValueOnce(false);
    const req = new NextRequest(`http://localhost${PATH}`, {
      method: "POST",
      body: "{}",
      headers: { "upstash-signature": "bad" },
    });
    expect((await POST(req)).status).toBe(401);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it("runs the batch on a valid internal HMAC", async () => {
    const res = await POST(internalReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      result: { claimed: 0, processed: 0, failed: 0, skipped: 0 },
    });
  });

  it("401 on wrong token, stale ts, or bad sig", async () => {
    expect((await POST(internalReq({ token: "wrong" }))).status).toBe(401);
    expect((await POST(internalReq({ ts: String(Date.now() - 6 * 60_000) }))).status).toBe(401);
    expect((await POST(internalReq({ sig: "deadbeef" }))).status).toBe(401);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it("500 with PROCESSOR_ERROR when the batch throws", async () => {
    h.batch.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(internalReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("PROCESSOR_ERROR");
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run app/api/internal/webhooks/delhivery/process/route.test.ts`

- [ ] **Step 7: Implement the route**

```ts
// app/api/internal/webhooks/delhivery/process/route.ts
// Drains the webhook_events queue. Called by the QStash schedule (signature
// verified) or manually with the INTERNAL_JOB_TOKEN HMAC headers. No session —
// the signature is the authorisation (CLAUDE.md service-role register).
import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Receiver } from "@upstash/qstash";
import { processWebhookEventBatch } from "@/lib/services/webhook-processor";

export const runtime = "nodejs";

const TIMEOUT_MS = 20_000;
const MAX_TS_SKEW_MS = 5 * 60_000;

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function verifyQstash(request: NextRequest, body: string): Promise<NextResponse | null> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json(
      { ok: false, error: { code: "QSTASH_KEYS_MISSING", message: "QStash signing keys unset" } },
      { status: 500 }
    );
  }
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const valid = await receiver
    .verify({
      signature: request.headers.get("upstash-signature") || "",
      body,
      clockTolerance: 60,
    })
    .catch(() => false);
  if (!valid) {
    return NextResponse.json({ ok: false, error: { code: "BAD_SIGNATURE", message: "Invalid QStash signature" } }, { status: 401 });
  }
  return null;
}

function verifyInternal(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_JOB_TOKEN?.trim();
  const token = request.headers.get("x-internal-job-token");
  const ts = request.headers.get("x-job-ts");
  const sig = request.headers.get("x-job-sig");
  const unauthorized = NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid internal job auth" } },
    { status: 401 }
  );
  if (!secret || !token || !ts || !sig) return unauthorized;
  if (!constantTimeEqual(token, secret)) return unauthorized;
  const tsMs = parseInt(ts, 10);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TS_SKEW_MS) return unauthorized;
  const expected = createHmac("sha256", secret)
    .update(`${ts}:${request.nextUrl.pathname}`)
    .digest("hex");
  if (!constantTimeEqual(sig, expected)) return unauthorized;
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const denied = request.headers.has("upstash-signature")
    ? await verifyQstash(request, body)
    : verifyInternal(request);
  if (denied) return denied;

  try {
    const result = await Promise.race([
      processWebhookEventBatch(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PROCESSOR_TIMEOUT")), TIMEOUT_MS)
      ),
    ]);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = message === "PROCESSOR_TIMEOUT" ? "PROCESSOR_TIMEOUT" : "PROCESSOR_ERROR";
    console.error("[delhivery-processor]", message);
    return NextResponse.json({ ok: false, error: { code, message } }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run — expect PASS**

Run: `npx vitest run app/api/internal/webhooks/delhivery/process/route.test.ts`

- [ ] **Step 9: Commit**

```bash
git add lib/services/webhook-processor.ts lib/services/webhook-processor.test.ts app/api/internal/webhooks/delhivery/process
git commit -m "feat(shipping): webhook processor turns scan events into admin notifications"
```

---

### Task 6: Admin orders API (list + detail + PATCH)

**Files:**
- Create: `app/api/admin/orders/route.ts`
- Create: `app/api/admin/orders/route.test.ts`
- Create: `app/api/admin/orders/[id]/route.ts`
- Create: `app/api/admin/orders/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/services/admin-gate`, `createAdminSupabaseClient`, `CacheService` (default import from `@/lib/services/cache`: `clearAllOrders(userId)`, `clearOrderDetails(userId, orderId)`), `billUrl` from `@/lib/invoice/bill-link`, `OrderStatus` from `@/lib/types/order`.
- Produces:
  - `GET /api/admin/orders?limit&offset&status&fulfilment&from_date&to_date` → `{ orders: AdminOrderRow[], total: number }` where `AdminOrderRow = orders row & { items: rows[], payments: rows[], bill_url: string | null }`. `limit` default 50 max 100; `status=all` ignored; `fulfilment` ∈ `delivery|pickup`; dates are `YYYY-MM-DD` (`to_date` widened to end of day). Sorted `created_at desc`.
  - `GET /api/admin/orders/[id]` → `{ order: AdminOrderRow }` or 404.
  - `PATCH /api/admin/orders/[id]` with body `{ status?, tracking_number?, carrier_name?, delivery_notes?, estimated_delivery_date? }` → `{ order }`. 400 unknown status or empty body; 404 missing order; **409** when a status change races another write or violates a DB CHECK (SQLSTATE `23514`). On a status change: optimistic `.eq("status", current.status)` and an `order_status_events` audit row `{ order_id, from_status, to_status, actor_admin_id }`. Clears `user:orders:*` / `user:order:*` caches best-effort.
  - The status whitelist (all ten statuses including `verifying_payment`) is a module-local `const VALID_ORDER_STATUSES` — NOT exported: Next 15 rejects non-handler exports from route files, and the UI (Task 11) keeps its own copy to avoid pulling server imports into the client bundle.

- [ ] **Step 1: Write the failing list-route tests**

```ts
// app/api/admin/orders/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1", app_metadata: { role: "admin" } } as Row | null,
    orders: [] as Row[],
    total: 0,
    filters: [] as [string, unknown][],
  };
  function listQuery() {
    const q: Record<string, unknown> = {};
    const chain = (ret: unknown) => vi.fn(() => ret);
    q.eq = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.gte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.lte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.order = chain(q);
    q.range = vi.fn(async () => ({ data: state.orders, error: null }));
    q.then = undefined;
    return q;
  }
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: vi.fn((_c: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              const q = listQuery();
              // count query resolves directly when awaited via range-less await
              (q as Row).eq = q.eq; // same filter recording
              return Object.assign(Promise.resolve({ count: state.total, error: null }), q);
            }
            return listQuery();
          }),
        };
      if (table === "order_items" || table === "payments")
        return {
          select: () => ({
            in: () =>
              table === "payments"
                ? { order: async () => ({ data: [], error: null }) }
                : Promise.resolve({ data: [], error: null }),
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { state, admin, reset: () => { state.orders = []; state.total = 0; state.filters = []; state.user = { id: "admin-1", app_metadata: { role: "admin" } }; } };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => {
    if (!h.state.user) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { user: h.state.user };
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));
vi.mock("@/lib/invoice/bill-link", () => ({ billUrl: (id: string) => `https://cozyberries.in/bill/${id}/sig` }));

import { GET } from "./route";

const req = (qs = "") => new NextRequest(`http://localhost/api/admin/orders${qs}`);

beforeEach(() => h.reset());

describe("GET /api/admin/orders", () => {
  it("401/403 comes straight from the gate", async () => {
    h.state.user = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("returns orders with items, payments and bill_url", async () => {
    h.state.orders = [{ id: "o-1", user_id: "u-1", status: "processing" }];
    h.state.total = 1;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.orders[0]).toMatchObject({ id: "o-1", items: [], payments: [], bill_url: expect.stringContaining("/bill/o-1/") });
  });

  it("applies status, fulfilment and date filters; ignores status=all", async () => {
    await GET(req("?status=shipped&fulfilment=pickup&from_date=2026-09-01&to_date=2026-09-28"));
    expect(h.state.filters).toEqual(
      expect.arrayContaining([
        ["status", "shipped"],
        ["fulfilment_method", "pickup"],
        ["created_at", "2026-09-01"],
        ["created_at", "2026-09-28T23:59:59.999Z"],
      ])
    );
    h.state.filters = [];
    await GET(req("?status=all"));
    expect(h.state.filters.find(([c]) => c === "status")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run app/api/admin/orders/route.test.ts`

- [ ] **Step 3: Implement the list route**

```ts
// app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { billUrl } from "@/lib/invoice/bill-link";

type Row = Record<string, unknown>;

function safeBillUrl(orderId: string): string | null {
  try {
    return billUrl(orderId);
  } catch {
    return null; // INVOICE_LINK_SECRET misconfigured — degrade like /api/admin/pickup-orders
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);
  const status = sp.get("status");
  const fulfilment = sp.get("fulfilment");
  const fromDate = sp.get("from_date");
  const toDate = sp.get("to_date");

  const admin = createAdminSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (status && status !== "all") q = q.eq("status", status);
    if (fulfilment === "delivery" || fulfilment === "pickup") q = q.eq("fulfilment_method", fulfilment);
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", `${toDate}T23:59:59.999Z`);
    return q;
  };

  const { count, error: countError } = await applyFilters(
    admin.from("orders").select("id", { count: "exact", head: true })
  );
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const { data: orders, error } = await applyFilters(admin.from("orders").select("*"))
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (orders ?? []) as Row[];
  const ids = rows.map((o) => o.id as string);
  let items: Row[] = [];
  let payments: Row[] = [];
  if (ids.length > 0) {
    const [itemsRes, paymentsRes] = await Promise.all([
      admin.from("order_items").select("*").in("order_id", ids),
      admin.from("payments").select("*").in("order_id", ids).order("created_at", { ascending: false }),
    ]);
    items = (itemsRes.data ?? []) as Row[];
    payments = (paymentsRes.data ?? []) as Row[];
  }

  const byOrder = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const k = r.order_id as string;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const itemMap = byOrder(items);
  const paymentMap = byOrder(payments);

  return NextResponse.json({
    orders: rows.map((o) => ({
      ...o,
      items: itemMap.get(o.id as string) ?? [],
      payments: paymentMap.get(o.id as string) ?? [],
      bill_url: safeBillUrl(o.id as string),
    })),
    total: count ?? 0,
  });
}
```

- [ ] **Step 4: Run — expect PASS** (adjust the test's count-query fake if the chaining differs, but do not weaken the assertions)

Run: `npx vitest run app/api/admin/orders/route.test.ts`

- [ ] **Step 5: Write the failing detail/PATCH tests**

```ts
// app/api/admin/orders/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1", app_metadata: { role: "admin" } } as Row | null,
    order: { id: "o-1", user_id: "u-1", status: "payment_confirmed" } as Row | null,
    updatedRow: null as Row | null,
    updateError: null as { code?: string; message: string } | null,
    updates: [] as Row[],
    updateEqs: [] as [string, unknown][],
    audits: [] as Row[],
    cacheCalls: [] as string[],
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.order, error: null }) }),
          }),
          update: vi.fn((patch: Row) => {
            state.updates.push(patch);
            const q: Row = {};
            (q.eq as unknown) = vi.fn((col: string, v: unknown) => {
              state.updateEqs.push([col, v]);
              return q;
            });
            (q.select as unknown) = vi.fn(() => ({
              maybeSingle: async () =>
                state.updateError
                  ? { data: null, error: state.updateError }
                  : { data: state.updatedRow, error: null },
            }));
            return q;
          }),
        };
      if (table === "order_status_events")
        return { insert: vi.fn(async (row: Row) => { state.audits.push(row); return { error: null }; }) };
      if (table === "order_items" || table === "payments")
        return {
          select: () => ({
            eq: () =>
              table === "payments"
                ? { order: async () => ({ data: [], error: null }) }
                : Promise.resolve({ data: [], error: null }),
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return {
    state,
    admin,
    reset: () => {
      state.user = { id: "admin-1", app_metadata: { role: "admin" } };
      state.order = { id: "o-1", user_id: "u-1", status: "payment_confirmed" };
      state.updatedRow = { id: "o-1", user_id: "u-1", status: "processing" };
      state.updateError = null;
      state.updates = [];
      state.updateEqs = [];
      state.audits = [];
      state.cacheCalls = [];
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => {
    if (!h.state.user) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user: h.state.user };
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));
vi.mock("@/lib/invoice/bill-link", () => ({ billUrl: () => "https://cozyberries.in/bill/o-1/sig" }));
vi.mock("@/lib/services/cache", () => ({
  default: {
    clearAllOrders: vi.fn(async (uid: string) => { h.state.cacheCalls.push(`all:${uid}`); return true; }),
    clearOrderDetails: vi.fn(async (uid: string, oid: string) => { h.state.cacheCalls.push(`one:${uid}:${oid}`); return true; }),
  },
}));

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "o-1" }) };
const patchReq = (body: Row) =>
  new NextRequest("http://localhost/api/admin/orders/o-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => h.reset());

describe("GET /api/admin/orders/[id]", () => {
  it("404 when the order is missing", async () => {
    h.state.order = null;
    expect((await GET(new NextRequest("http://localhost/x"), params)).status).toBe(404);
  });
  it("returns the order with items and payments", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ id: "o-1", items: [], payments: [] });
  });
});

describe("PATCH /api/admin/orders/[id]", () => {
  it("400 on an unknown status and on an empty body", async () => {
    expect((await PATCH(patchReq({ status: "bogus" }), params)).status).toBe(400);
    expect((await PATCH(patchReq({}), params)).status).toBe(400);
    expect(h.state.updates).toHaveLength(0);
  });

  it("accepts verifying_payment (the admin app's whitelist forgot it)", async () => {
    h.state.updatedRow = { id: "o-1", user_id: "u-1", status: "verifying_payment" };
    expect((await PATCH(patchReq({ status: "verifying_payment" }), params)).status).toBe(200);
  });

  it("status change: optimistic eq, audit row, cache cleared", async () => {
    const res = await PATCH(patchReq({ status: "processing" }), params);
    expect(res.status).toBe(200);
    expect(h.state.updateEqs).toEqual(
      expect.arrayContaining([["id", "o-1"], ["status", "payment_confirmed"]])
    );
    expect(h.state.audits[0]).toMatchObject({
      order_id: "o-1",
      from_status: "payment_confirmed",
      to_status: "processing",
      actor_admin_id: "admin-1",
    });
    expect(h.state.cacheCalls).toEqual(expect.arrayContaining(["all:u-1", "one:u-1:o-1"]));
  });

  it("409 when the status changed under us; no audit row, no cache clear", async () => {
    h.state.updatedRow = null; // maybeSingle -> no row matched the optimistic eq
    const res = await PATCH(patchReq({ status: "processing" }), params);
    expect(res.status).toBe(409);
    expect(h.state.audits).toHaveLength(0);
    expect(h.state.cacheCalls).toHaveLength(0);
  });

  it("409 with the message on a CHECK violation (pickup-only status on delivery order)", async () => {
    h.state.updateError = { code: "23514", message: 'violates check constraint "orders_pickup_status_check"' };
    const res = await PATCH(patchReq({ status: "ready_for_pickup" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("check constraint");
  });

  it("tracking-only update skips the optimistic status eq and the audit row", async () => {
    h.state.updatedRow = { id: "o-1", user_id: "u-1", status: "payment_confirmed", tracking_number: "AWB9" };
    const res = await PATCH(patchReq({ tracking_number: "AWB9", carrier_name: "Delhivery" }), params);
    expect(res.status).toBe(200);
    expect(h.state.updateEqs.find(([c]) => c === "status")).toBeUndefined();
    expect(h.state.audits).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run app/api/admin/orders/[id]/route.test.ts`

- [ ] **Step 7: Implement the detail/PATCH route**

```ts
// app/api/admin/orders/[id]/route.ts
// Admin order detail + edit. Status writes go through the DB unmodified so the
// orders_on_status_change trigger keeps sole ownership of stock movements and
// GST invoice numbering. CHECK violations (pickup-only vs delivery-only
// statuses) surface as 409.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";
import { billUrl } from "@/lib/invoice/bill-link";
import type { OrderStatus } from "@/lib/types/order";

// Module-local on purpose: route files may only export handlers/config in Next 15.
const VALID_ORDER_STATUSES: OrderStatus[] = [
  "payment_pending",
  "verifying_payment",
  "payment_confirmed",
  "processing",
  "ready_for_pickup",
  "collected",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

type Row = Record<string, unknown>;

function safeBillUrl(orderId: string): string | null {
  try {
    return billUrl(orderId);
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const [itemsRes, paymentsRes] = await Promise.all([
    admin.from("order_items").select("*").eq("order_id", id),
    admin.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({
    order: {
      ...order,
      items: itemsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      bill_url: safeBillUrl(id),
    },
  });
}

const EDITABLE_FIELDS = [
  "tracking_number",
  "carrier_name",
  "delivery_notes",
  "estimated_delivery_date",
] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let body: Row;
  try {
    body = (await request.json()) as Row;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const nextStatus = body.status as OrderStatus | undefined;
  if (nextStatus !== undefined && !VALID_ORDER_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: `Unknown status: ${String(nextStatus)}` }, { status: 400 });
  }

  const update: Row = {};
  for (const f of EDITABLE_FIELDS) {
    if (f in body) update[f] = body[f];
  }
  if (nextStatus !== undefined) update.status = nextStatus;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminSupabaseClient();
  const { data: current, error: readError } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const changingStatus = nextStatus !== undefined && nextStatus !== current.status;
  let query = admin.from("orders").update(update).eq("id", id);
  if (changingStatus) query = query.eq("status", current.status);
  const { data: updated, error: updateError } = await query.select("*").maybeSingle();

  if (updateError) {
    const status = updateError.code === "23514" ? 409 : 500;
    return NextResponse.json({ error: updateError.message }, { status });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "Order changed while you were editing; reload and retry" },
      { status: 409 }
    );
  }

  if (changingStatus) {
    const { error: auditError } = await admin.from("order_status_events").insert({
      order_id: id,
      from_status: current.status,
      to_status: nextStatus,
      actor_admin_id: gate.user.id,
    });
    if (auditError) console.error("[admin-orders] audit insert failed:", auditError.message);
  }

  const userId = current.user_id as string;
  Promise.all([
    CacheService.clearAllOrders(userId),
    CacheService.clearOrderDetails(userId, id),
  ]).catch((e) => console.error("[admin-orders] cache clear failed:", e));

  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 8: Run — expect PASS; also lint**

Run: `npx vitest run app/api/admin/orders` then `npm run lint -- --file app/api/admin/orders/route.ts --file "app/api/admin/orders/[id]/route.ts"` (or plain `npm run lint`)

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/orders
git commit -m "feat(admin): orders list and status/tracking edit APIs"
```

---

### Task 7: Shipment create/cancel routes

**Files:**
- Create: `app/api/admin/orders/[id]/shipment/route.ts`
- Create: `app/api/admin/orders/[id]/shipment/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminSupabaseClient`, `CacheService`, `createShipment` / `cancelShipment` / `getDelhiveryConfig` / `isDelhiveryOrder` (Task 1), `CreateShipmentRequest` from `@/lib/delhivery/types`.
- Produces:
  - `POST /api/admin/orders/[id]/shipment` (optional body `{ warehouse_name?, weight?, shipping_mode?, seller_add? }`) → 200 `{ success: true, waybill, package_count, upload_wbn }`. 404 missing order; 409 pickup order; 409 already has a Delhivery waybill (payload includes `waybill`); 400 no shipping address / no warehouse name; 422 Delhivery rejected; 502 (or Delhivery `statusCode`) transport error. On success writes `{ tracking_number, carrier_name: "Delhivery", status: "processing", updated_at }` and clears the user's order caches.
  - `DELETE /api/admin/orders/[id]/shipment` → cancels at Delhivery. **The order status is NOT touched** (deliberate change from the admin app, per spec: cancelling a shipment must not cancel the order). On success writes `{ tracking_number: null, carrier_name: null, delhivery_latest_status: null, delhivery_latest_scan_at: null, delhivery_latest_location: null, delivery_notes: "Shipment <waybill> cancelled[: remark]", updated_at }` so a new shipment can be created. 400 if the order has no Delhivery shipment; 422 Delhivery refused; **503** `{ success: false, delhivery_success: true, db_update_success: false, waybill }` when Delhivery cancelled but the DB write failed (tracking left intact for reconciliation).

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/admin/orders/[id]/shipment/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    order: null as Row | null,
    items: [] as Row[],
    updateError: null as { message: string } | null,
    updates: [] as Row[],
    createResult: { ok: true, data: { success: true, package_count: 1, upload_wbn: "UPL1", packages: [{ status: "Success", waybill: "WB123", remarks: [] }] } } as Row,
    cancelResult: { ok: true, data: { status: true, waybill: "WB123", remark: "Cancelled", order_id: "ORD-1" } } as Row,
    createCalls: [] as Row[],
    cancelCalls: [] as string[],
  };
  return { state, reset: () => { state.order = null; state.items = []; state.updateError = null; state.updates = []; state.createCalls = []; state.cancelCalls = []; } };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "orders")
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.state.order, error: null }) }) }),
          update: (patch: Row) => ({
            eq: async () => {
              if (h.state.updateError) return { error: h.state.updateError };
              h.state.updates.push(patch);
              return { error: null };
            },
          }),
        };
      if (table === "order_items")
        return { select: () => ({ eq: async () => ({ data: h.state.items, error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));
vi.mock("@/lib/services/cache", () => ({
  default: { clearAllOrders: vi.fn(async () => true), clearOrderDetails: vi.fn(async () => true) },
}));
vi.mock("@/lib/delhivery/client", () => ({
  createShipment: vi.fn(async (payload: Row) => { h.state.createCalls.push(payload); return h.state.createResult; }),
  cancelShipment: vi.fn(async (wb: string) => { h.state.cancelCalls.push(wb); return h.state.cancelResult; }),
}));

import { POST, DELETE } from "./route";

const params = { params: Promise.resolve({ id: "o-1" }) };
const post = (body: Row = {}) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);
const del = () => DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), params);

const deliveryOrder = (over: Row = {}): Row => ({
  id: "o-1",
  user_id: "u-1",
  order_number: "ORD-1",
  fulfilment_method: "delivery",
  tracking_number: null,
  carrier_name: null,
  status: "payment_confirmed",
  total_amount: 999,
  customer_phone: "9999999999",
  shipping_address: {
    full_name: "Asha", phone: "8888888888", address_line_1: "12 MG Road",
    address_line_2: "", city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "India",
  },
  payments: [],
  ...over,
});

beforeEach(() => {
  h.reset();
  vi.stubEnv("DELIVERY_API_KEY", "tok");
  vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "CB-WH");
  h.state.order = deliveryOrder();
  h.state.items = [{ order_id: "o-1", sku: "frock-red-2-3y", quantity: 2, size: "2-3Y" }];
});
afterEach(() => vi.unstubAllEnvs());

describe("POST .../shipment", () => {
  it("409 for pickup orders; Delhivery never called", async () => {
    h.state.order = deliveryOrder({ fulfilment_method: "pickup" });
    expect((await post()).status).toBe(409);
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("409 when a Delhivery waybill already exists, with the waybill in the body", async () => {
    h.state.order = deliveryOrder({ tracking_number: "WB-OLD", carrier_name: "Delhivery" });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).waybill).toBe("WB-OLD");
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("400 without a shipping address or warehouse name", async () => {
    h.state.order = deliveryOrder({ shipping_address: null });
    expect((await post()).status).toBe(400);
    h.state.order = deliveryOrder();
    vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "");
    expect((await post()).status).toBe(400);
  });

  it("creates the shipment and writes tracking + processing", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, waybill: "WB123" });
    const sent = h.state.createCalls[0] as { shipments: Row[]; pickup_location: Row };
    expect(sent.pickup_location).toEqual({ name: "CB-WH" });
    expect(sent.shipments[0]).toMatchObject({
      name: "Asha", order: "ORD-1", pin: 560001, payment_mode: "Prepaid", weight: 500,
    });
    expect(h.state.updates[0]).toMatchObject({
      tracking_number: "WB123", carrier_name: "Delhivery", status: "processing",
    });
  });

  it("422 when Delhivery rejects; no DB write", async () => {
    h.state.createResult = { ok: true, data: { success: false, rmk: "Bad pin", packages: [] } };
    expect((await post()).status).toBe(422);
    expect(h.state.updates).toHaveLength(0);
  });
});

describe("DELETE .../shipment", () => {
  beforeEach(() => {
    h.state.order = deliveryOrder({ tracking_number: "WB123", carrier_name: "Delhivery", status: "processing" });
  });

  it("400 when there is no Delhivery shipment", async () => {
    h.state.order = deliveryOrder();
    expect((await del()).status).toBe(400);
    expect(h.state.cancelCalls).toHaveLength(0);
  });

  it("cancels and clears tracking without touching status", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(h.state.cancelCalls).toEqual(["WB123"]);
    const patch = h.state.updates[0];
    expect(patch).toMatchObject({ tracking_number: null, carrier_name: null, delhivery_latest_status: null });
    expect(patch.delivery_notes).toContain("WB123");
    expect("status" in patch).toBe(false);
  });

  it("422 when Delhivery refuses; no DB write", async () => {
    h.state.cancelResult = { ok: true, data: { status: false, remark: "Already dispatched" } };
    expect((await del()).status).toBe(422);
    expect(h.state.updates).toHaveLength(0);
  });

  it("503 split-state when Delhivery cancelled but the DB write failed", async () => {
    h.state.updateError = { message: "db down" };
    const res = await del();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      success: false, delhivery_success: true, db_update_success: false, waybill: "WB123",
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run "app/api/admin/orders/[id]/shipment/route.test.ts"`

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/orders/[id]/shipment/route.ts
// Create/cancel a Delhivery shipment for an order. Cancelling a shipment does
// NOT cancel the order (the admin app conflated the two); it clears the
// tracking fields so a replacement shipment can be created.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";
import { createShipment, cancelShipment } from "@/lib/delhivery/client";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import type { CreateShipmentRequest } from "@/lib/delhivery/types";

type Row = Record<string, unknown>;

const ORDER_COLUMNS =
  "id, user_id, order_number, fulfilment_method, tracking_number, carrier_name, status, total_amount, customer_phone, shipping_address, payments(payment_method, status)";

function clearCaches(userId: string, orderId: string) {
  Promise.all([
    CacheService.clearAllOrders(userId),
    CacheService.clearOrderDetails(userId, orderId),
  ]).catch((e) => console.error("[admin-shipment] cache clear failed:", e));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let body: Row = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Row;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.fulfilment_method === "pickup") {
    return NextResponse.json({ error: "Pickup orders have no shipments" }, { status: 409 });
  }
  if (order.tracking_number && (order.carrier_name as string | null) === "Delhivery") {
    return NextResponse.json(
      { error: "Order already has a Delhivery shipment", waybill: order.tracking_number },
      { status: 409 }
    );
  }
  const addr = order.shipping_address as Row | null;
  if (!addr) {
    return NextResponse.json({ error: "Order has no shipping address" }, { status: 400 });
  }
  const warehouseName =
    ((body.warehouse_name as string) || process.env.DELHIVERY_WAREHOUSE_NAME || "").trim();
  if (!warehouseName) {
    return NextResponse.json(
      { error: "No warehouse name (body.warehouse_name or DELHIVERY_WAREHOUSE_NAME)" },
      { status: 400 }
    );
  }

  const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
  const lines = (items ?? []) as Row[];
  const productsDesc = lines
    .map((it) => `${(it.sku as string) || "item"}(${(it.quantity as number) ?? 1})`)
    .join("~");
  const totalQty = lines.reduce((sum, it) => sum + ((it.quantity as number) ?? 1), 0);

  const payments = (order.payments ?? []) as Row[];
  const isCod = payments.some((p) => p.payment_method === "cod" && p.status === "completed");
  const totalAmount = (order.total_amount as number) ?? 0;

  const payload: CreateShipmentRequest = {
    shipments: [
      {
        name: (addr.full_name as string) || "Customer",
        order: (order.order_number as string) || id,
        phone: (addr.phone as string) || (order.customer_phone as string) || "",
        add: [addr.address_line_1, addr.address_line_2].filter(Boolean).join(", "),
        pin: parseInt((addr.postal_code as string) || "0", 10),
        city: (addr.city as string) || "",
        state: (addr.state as string) || "",
        country: (addr.country as string) || "India",
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? totalAmount : 0,
        total_amount: totalAmount,
        weight: (body.weight as number) || 500,
        products_desc: productsDesc,
        quantity: String(totalQty || 1),
        shipping_mode: (body.shipping_mode as string) || "Surface",
        seller_name: warehouseName || "Cozyberries",
        seller_add: (body.seller_add as string) || "",
        return_name: warehouseName || "Cozyberries",
        waybill: "",
      },
    ],
    pickup_location: { name: warehouseName },
  };

  const result = await createShipment(payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode || 502 });
  }
  const data = result.data;
  if (!data.success) {
    return NextResponse.json({ error: data.rmk || "Delhivery rejected the shipment" }, { status: 422 });
  }
  const pkg = data.packages?.[0];
  if (!pkg || pkg.status !== "Success") {
    return NextResponse.json(
      { error: (pkg?.remarks || []).join("; ") || "Delhivery returned no package" },
      { status: 422 }
    );
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({
      tracking_number: pkg.waybill,
      carrier_name: "Delhivery",
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    console.error("[admin-shipment] tracking write failed:", updateError.message);
  }
  clearCaches(order.user_id as string, id);

  return NextResponse.json({
    success: true,
    waybill: pkg.waybill,
    package_count: data.package_count,
    upload_wbn: data.upload_wbn,
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id, user_id, tracking_number, carrier_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const waybill = order.tracking_number as string | null;
  if (!isDelhiveryOrder(order.carrier_name as string | null, waybill)) {
    return NextResponse.json({ error: "Order has no Delhivery shipment" }, { status: 400 });
  }

  const result = await cancelShipment(waybill as string);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode || 502 });
  }
  if (!result.data.status) {
    return NextResponse.json(
      { error: result.data.error || result.data.remark || "Delhivery refused the cancellation" },
      { status: 422 }
    );
  }

  const remark = result.data.remark;
  const { error: updateError } = await admin
    .from("orders")
    .update({
      tracking_number: null,
      carrier_name: null,
      delhivery_latest_status: null,
      delhivery_latest_scan_at: null,
      delhivery_latest_location: null,
      delivery_notes: remark ? `Shipment ${waybill} cancelled: ${remark}` : `Shipment ${waybill} cancelled`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        delhivery_success: true,
        db_update_success: false,
        error: updateError.message,
        waybill,
      },
      { status: 503 }
    );
  }
  clearCaches(order.user_id as string, id);

  return NextResponse.json({
    success: true,
    delhivery_success: true,
    db_update_success: true,
    waybill,
    remark,
  });
}
```

Note: if `payments(payment_method, status)` embedded select fails against the mock or the live schema relationship name, fetch payments with a second query (`admin.from("payments").select("payment_method, status").eq("order_id", id)`) — keep the COD detection logic identical.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run "app/api/admin/orders/[id]/shipment/route.test.ts"`

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/orders/[id]/shipment"
git commit -m "feat(admin): Delhivery shipment create/cancel for orders"
```

---

### Task 8: Admin notifications API

**Files:**
- Create: `app/api/admin/notifications/route.ts`
- Create: `app/api/admin/notifications/route.test.ts`
- Create: `app/api/admin/notifications/[id]/route.ts`
- Create: `app/api/admin/notifications/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminSupabaseClient`.
- Produces:
  - `GET /api/admin/notifications?limit` → `{ notifications: Row[], unread: number }` — **only** broadcast rows (`user_id IS NULL`), newest first, limit default 30 max 100. Unread = count of `user_id IS NULL AND read = false`.
  - `PATCH /api/admin/notifications/[id]` body `{ read: boolean }` → `{ notification }`; the update is scoped `.eq("id", id).is("user_id", null)` so a customer-owned notification id can never be touched → 404.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/admin/notifications/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = { rows: [] as Row[], unread: 0, isCalls: [] as [string, unknown][] };
  const listChain = {
    is: vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return listChain; }),
    eq: vi.fn(() => listChain),
    order: vi.fn(() => listChain),
    limit: vi.fn(async () => ({ data: state.rows, error: null })),
  };
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const countChain: Row = {};
          (countChain.is as unknown) = vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return countChain; });
          (countChain.eq as unknown) = vi.fn(() => Promise.resolve({ count: state.unread, error: null }));
          return countChain;
        }
        return listChain;
      }),
    })),
  };
  return { state, admin, reset: () => { state.rows = []; state.unread = 0; state.isCalls = []; } };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { GET } from "./route";

beforeEach(() => h.reset());

describe("GET /api/admin/notifications", () => {
  it("returns broadcast rows and unread count, scoped to user_id IS NULL", async () => {
    h.state.rows = [{ id: "n-1", user_id: null, type: "shipping_scan", read: false }];
    h.state.unread = 1;
    const res = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: h.state.rows, unread: 1 });
    // Review Focus #5: both queries must filter user_id IS NULL
    expect(h.state.isCalls.filter(([c, v]) => c === "user_id" && v === null)).toHaveLength(2);
  });
});
```

```ts
// app/api/admin/notifications/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = { updated: null as Row | null, scopes: [] as [string, unknown][] };
  const admin = {
    from: vi.fn(() => ({
      update: vi.fn(() => {
        const chain: Row = {};
        (chain.eq as unknown) = vi.fn((c: string, v: unknown) => { state.scopes.push([c, v]); return chain; });
        (chain.is as unknown) = vi.fn((c: string, v: unknown) => { state.scopes.push([c, v]); return chain; });
        (chain.select as unknown) = vi.fn(() => ({ maybeSingle: async () => ({ data: state.updated, error: null }) }));
        return chain;
      }),
    })),
  };
  return { state, admin, reset: () => { state.updated = null; state.scopes = []; } };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "n-1" }) };
const req = (body: Row) =>
  new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => h.reset());

describe("PATCH /api/admin/notifications/[id]", () => {
  it("400 when read is not a boolean", async () => {
    expect((await PATCH(req({ read: "yes" }), params)).status).toBe(400);
  });

  it("marks read, scoped to id AND user_id IS NULL", async () => {
    h.state.updated = { id: "n-1", read: true };
    const res = await PATCH(req({ read: true }), params);
    expect(res.status).toBe(200);
    expect(h.state.scopes).toEqual(expect.arrayContaining([["id", "n-1"], ["user_id", null]]));
  });

  it("404 for a customer-owned notification id (scope matches nothing)", async () => {
    h.state.updated = null; // .is('user_id', null) excluded the row
    expect((await PATCH(req({ read: true }), params)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (modules missing)

Run: `npx vitest run app/api/admin/notifications`

- [ ] **Step 3: Implement both routes**

```ts
// app/api/admin/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const limit = Math.min(
    Math.max(parseInt(request.nextUrl.searchParams.get("limit") || "30", 10) || 30, 1),
    100
  );
  const admin = createAdminSupabaseClient();
  const [listRes, countRes] = await Promise.all([
    admin
      .from("notifications")
      .select("*")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("user_id", null)
      .eq("read", false),
  ]);
  if (listRes.error) return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  return NextResponse.json({
    notifications: listRes.data ?? [],
    unread: countRes.count ?? 0,
  });
}
```

```ts
// app/api/admin/notifications/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let body: { read?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.read !== "boolean") {
    return NextResponse.json({ error: "read must be a boolean" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("notifications")
    .update({ read: body.read, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("user_id", null) // broadcast rows only — customer rows are untouchable here
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  return NextResponse.json({ notification: data });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/api/admin/notifications`

- [ ] **Step 5: Verify the customer route cannot see broadcast rows**

Read `app/api/notifications/route.ts` and confirm its list query filters `.eq("user_id", user.id)` (an `eq` never matches `NULL`, so broadcast rows are invisible to customers). If — and only if — it uses anything other than an equality on `user_id`, add the filter and a colocated test. Otherwise add nothing; note the confirmation in the commit message.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/notifications
git commit -m "feat(admin): broadcast notifications API (list + mark read)"
```

---

### Task 9: Admin live-tracking route

**Files:**
- Create: `app/api/admin/shipping/tracking/route.ts`
- Create: `app/api/admin/shipping/tracking/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminSupabaseClient`, `fetchPackageTrackingByWaybill(waybill: string): Promise<OrderShipmentTrackingData>` from `@/lib/server/delhivery-package-tracking` (existing; `OrderShipmentTrackingData = { waybill: string; currentStatus?: string; scans: { status: string; location?: string; timestamp?: string; remarks?: string }[] }` from `@/lib/types/delhivery-tracking`), `Redis` from `@upstash/redis`.
- Produces: `GET /api/admin/shipping/tracking?waybill=<awb>&order_id=<uuid>` → `{ tracking: OrderShipmentTrackingData, cached: boolean }`. 400 missing waybill; 502 upstream failure. Redis cache key `delhivery:track:${waybill}`, TTL 90 s. When `order_id` is given, fire-and-forget summary write to `orders.delhivery_latest_*` only if that order's `tracking_number` matches the waybill, its carrier contains "delhivery", and its status is `shipped` or `delivered`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/admin/shipping/tracking/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    cache: new Map<string, unknown>(),
    setCalls: [] as [string, unknown, unknown][],
    order: null as Row | null,
    orderUpdates: [] as Row[],
    tracking: {
      waybill: "WB1",
      currentStatus: "In Transit",
      scans: [
        { status: "Picked up", timestamp: "2026-09-27T10:00:00Z", location: "BLR" },
        { status: "In Transit", timestamp: "2026-09-28T10:00:00Z", location: "DEL" },
      ],
    },
    fetchError: null as Error | null,
  };
  return {
    state,
    reset: () => {
      state.cache.clear();
      state.setCalls = [];
      state.order = null;
      state.orderUpdates = [];
      state.fetchError = null;
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => h.state.cache.get(k) ?? null,
      set: async (k: string, v: unknown, opts: unknown) => { h.state.setCalls.push([k, v, opts]); },
    }),
  },
}));
vi.mock("@/lib/server/delhivery-package-tracking", () => ({
  fetchPackageTrackingByWaybill: vi.fn(async () => {
    if (h.state.fetchError) throw h.state.fetchError;
    return h.state.tracking;
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.state.order, error: null }) }) }),
      update: (patch: Row) => ({ eq: async () => { h.state.orderUpdates.push(patch); return { error: null }; } }),
    }),
  }),
}));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/shipping/tracking${qs}`);

beforeEach(() => h.reset());

describe("GET /api/admin/shipping/tracking", () => {
  it("400 without a waybill", async () => {
    expect((await GET(req(""))).status).toBe(400);
  });

  it("cache miss: fetches, caches for 90s, returns cached:false", async () => {
    const res = await GET(req("?waybill=WB1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.tracking.waybill).toBe("WB1");
    expect(h.state.setCalls[0][0]).toBe("delhivery:track:WB1");
    expect(h.state.setCalls[0][2]).toEqual({ ex: 90 });
  });

  it("cache hit returns cached:true without fetching", async () => {
    h.state.cache.set("delhivery:track:WB1", h.state.tracking);
    const { fetchPackageTrackingByWaybill } = await import("@/lib/server/delhivery-package-tracking");
    const body = await (await GET(req("?waybill=WB1"))).json();
    expect(body.cached).toBe(true);
    expect(fetchPackageTrackingByWaybill).not.toHaveBeenCalled();
  });

  it("502 when the upstream call fails", async () => {
    h.state.fetchError = new Error("delhivery down");
    expect((await GET(req("?waybill=WB1"))).status).toBe(502);
  });

  it("writes the latest-scan summary only for a matching shipped order", async () => {
    h.state.order = { id: "o-1", tracking_number: "WB1", carrier_name: "Delhivery", status: "shipped" };
    await GET(req("?waybill=WB1&order_id=o-1"));
    await new Promise((r) => setTimeout(r, 0)); // fire-and-forget settles
    expect(h.state.orderUpdates[0]).toMatchObject({
      delhivery_latest_status: "In Transit",
      delhivery_latest_scan_at: "2026-09-28T10:00:00Z", // newest scan, regardless of array order
      delhivery_latest_location: "DEL",
    });
  });

  it("skips the summary write when the order does not qualify", async () => {
    h.state.order = { id: "o-1", tracking_number: "OTHER", carrier_name: "Delhivery", status: "shipped" };
    await GET(req("?waybill=WB1&order_id=o-1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.state.orderUpdates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './route'`)

Run: `npx vitest run app/api/admin/shipping/tracking/route.test.ts`

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/shipping/tracking/route.ts
// Live Delhivery tracking for the admin orders page. Reuses the customer
// route's fetchPackageTrackingByWaybill and caches 90s in Redis (the tracking
// panel polls every 90s — one upstream call per waybill per window).
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { fetchPackageTrackingByWaybill } from "@/lib/server/delhivery-package-tracking";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import type { OrderShipmentTrackingData } from "@/lib/types/delhivery-tracking";

const CACHE_TTL_SECONDS = 90;

function latestScan(tracking: OrderShipmentTrackingData) {
  return tracking.scans.reduce<OrderShipmentTrackingData["scans"][number] | null>((acc, s) => {
    if (!s.timestamp) return acc;
    if (!acc?.timestamp || s.timestamp > acc.timestamp) return s;
    return acc;
  }, null);
}

async function writeSummary(orderId: string, waybill: string, tracking: OrderShipmentTrackingData) {
  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, tracking_number, carrier_name, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  if (order.tracking_number !== waybill) return;
  if (!isDelhiveryOrder(order.carrier_name as string | null, waybill)) return;
  if (order.status !== "shipped" && order.status !== "delivered") return;
  if (!tracking.currentStatus) return;

  const scan = latestScan(tracking);
  await admin
    .from("orders")
    .update({
      delhivery_latest_status: tracking.currentStatus,
      delhivery_latest_scan_at: scan?.timestamp ?? null,
      delhivery_latest_location: scan?.location ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const waybill = request.nextUrl.searchParams.get("waybill")?.trim();
  const orderId = request.nextUrl.searchParams.get("order_id")?.trim();
  if (!waybill) {
    return NextResponse.json({ error: "waybill is required" }, { status: 400 });
  }

  const cacheKey = `delhivery:track:${waybill}`;
  let redis: Redis | null = null;
  try {
    redis = Redis.fromEnv();
    const cached = await redis.get<OrderShipmentTrackingData>(cacheKey);
    if (cached) {
      return NextResponse.json({ tracking: cached, cached: true });
    }
  } catch (e) {
    console.error("[admin-tracking] cache read failed:", e); // fall through to live call
  }

  let tracking: OrderShipmentTrackingData;
  try {
    tracking = await fetchPackageTrackingByWaybill(waybill);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tracking fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    await redis?.set(cacheKey, tracking, { ex: CACHE_TTL_SECONDS });
  } catch (e) {
    console.error("[admin-tracking] cache write failed:", e);
  }

  if (orderId) {
    writeSummary(orderId, waybill, tracking).catch((e) =>
      console.error("[admin-tracking] summary write failed:", e)
    );
  }

  return NextResponse.json({ tracking, cached: false });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run app/api/admin/shipping/tracking/route.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/shipping/tracking
git commit -m "feat(admin): cached Delhivery live tracking with order summary write"
```

---

### Task 10: Label print page

**Files:**
- Create: `components/admin/LabelPrint.tsx` (copied from `$ADMIN/components/admin/LabelPrint.tsx`)
- Create: `app/admin/print/label/[orderId]/page.tsx`
- Create: `app/admin/print/label/[orderId]/page.test.tsx`
- Maybe copy: `public/logo-black.png` (from `$ADMIN/public/logo-black.png`) if not already present

**Interfaces:**
- Consumes: `createServerSupabaseClient`, `createAdminSupabaseClient`, `isAdmin` from `@/lib/services/effective-user`, `getPackingSlipJSON` + `isDelhiveryOrder` (Task 1), `LabelPrint` client component (`pkg: PackingSlipRawPackage` prop).
- Produces: `GET /admin/print/label/[orderId]` — server-rendered 4×6in Delhivery label; `[orderId]` accepts an order number matching `/^ORD-\d{8}-\d{6}-\d{5}$/` or a UUID; `?autoPrint=true` triggers `window.print()` after 700 ms (behavior inside the copied `LabelPrint`).
- Deviation from the spec's route table, on purpose: the spec listed `GET /api/admin/shipping/label`, but this server component calls `getPackingSlipJSON` directly and no other consumer exists (the admin app's UI also bypassed its label API in favour of the print page), so no standalone label route is built.

- [ ] **Step 1: Copy the label component and logo**

```bash
mkdir -p "app/admin/print/label/[orderId]"
cp ../cozyberries-admin/components/admin/LabelPrint.tsx components/admin/LabelPrint.tsx
ls public/logo-black.png || cp ../cozyberries-admin/public/logo-black.png public/logo-black.png
```

Then open `components/admin/LabelPrint.tsx` and fix any imports that point at admin-only modules (its types import must resolve to `@/lib/delhivery/types`). It must remain a `"use client"` component with no auth logic.

- [ ] **Step 2: Write the failing page-gate test**

```tsx
// app/admin/print/label/[orderId]/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.order, error: null }) }),
      }),
    }),
  })),
}));
vi.mock("@/lib/delhivery/client", () => ({
  getPackingSlipJSON: vi.fn(async () => ({ ok: true, data: { packages: [{ wbn: "WB1" }] } })),
}));
vi.mock("@/components/admin/LabelPrint", () => ({ default: () => null }));

import LabelPage from "./page";

const props = { params: Promise.resolve({ orderId: "11111111-1111-1111-1111-111111111111" }) };

beforeEach(() => {
  h.user = null;
  h.order = null;
});

describe("/admin/print/label/[orderId] gate", () => {
  it("redirects anonymous users to /login", async () => {
    await expect(LabelPage(props)).rejects.toThrow(/REDIRECT:\/login/);
  });

  it("redirects non-admins to /", async () => {
    h.user = { id: "u-1", app_metadata: { role: "customer" } };
    await expect(LabelPage(props)).rejects.toThrow(/REDIRECT:\/$/);
  });

  it("renders for admins with a Delhivery order", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    h.order = { id: "o-1", order_number: "ORD-1", tracking_number: "WB1", carrier_name: "Delhivery" };
    await expect(LabelPage(props)).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (`Cannot find module './page'`)

Run: `npx vitest run "app/admin/print/label/[orderId]/page.test.tsx"`

- [ ] **Step 4: Implement the page**

```tsx
// app/admin/print/label/[orderId]/page.tsx
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { getPackingSlipJSON } from "@/lib/delhivery/client";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import LabelPrint from "@/components/admin/LabelPrint";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Shipping Label — Cozyberries",
  robots: { index: false, follow: false },
};

const ORDER_NUMBER_RE = /^ORD-\d{8}-\d{6}-\d{5}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Message({ children }: { children: React.ReactNode }) {
  return <div className="container mx-auto px-4 py-10 text-center text-sm">{children}</div>;
}

export default async function LabelPage({ params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/orders");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/"); // Non-admins should not learn this page exists.

  const { orderId } = await params;
  const admin = createAdminSupabaseClient();
  const column = ORDER_NUMBER_RE.test(orderId) ? "order_number" : UUID_RE.test(orderId) ? "id" : null;
  if (!column) return <Message>Unrecognised order reference.</Message>;

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, tracking_number, carrier_name")
    .eq(column, orderId)
    .maybeSingle();
  if (!order) return <Message>Order not found.</Message>;
  if (!isDelhiveryOrder(order.carrier_name, order.tracking_number)) {
    return <Message>This order has no Delhivery shipment.</Message>;
  }

  const slip = await getPackingSlipJSON(order.tracking_number as string);
  const pkg = slip.ok ? slip.data.packages?.[0] : undefined;
  if (!pkg) return <Message>Label unavailable from Delhivery. Try again in a minute.</Message>;

  return <LabelPrint pkg={pkg} />;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run "app/admin/print/label/[orderId]/page.test.tsx"`

- [ ] **Step 6: Commit**

```bash
git add components/admin/LabelPrint.tsx "app/admin/print/label" public/logo-black.png
git commit -m "feat(admin): server-rendered Delhivery label print page"
```

---

### Task 11: /admin/orders page UI

**Files:**
- Create: `app/admin/orders/page.tsx`
- Create: `app/admin/orders/page.test.tsx`
- Create: `app/admin/orders/api.ts`
- Create: `app/admin/orders/orders-client.tsx`
- Create: `app/admin/orders/orders-client.test.tsx`
- Create: `app/admin/orders/order-detail-dialog.tsx`
- Create: `app/admin/orders/tracking-panel.tsx`
- Create: `app/admin/orders/notifications-panel.tsx`
- Modify: `components/HamburgerSheet.tsx` (admin menu block, ~lines 298–315)

**Interfaces:**
- Consumes: Task 6 (`GET/PATCH /api/admin/orders*`, `VALID_ORDER_STATUSES`), Task 7 (`POST/DELETE .../shipment`), Task 8 (`/api/admin/notifications*`), Task 9 (`/api/admin/shipping/tracking`), `formatOrderStatus` + `getOrderStatusColor` from `@/lib/utils/order-status`, `OrderStatus` from `@/lib/types/order`, shadcn `Button/Input/Badge/Dialog/Select` from `@/components/ui/*`, `toast` from `sonner`.
- Produces: the `/admin/orders` page. Query keys: `["admin","orders",filters]`, `["admin","orders","detail",id]`, `["admin","delhivery","tracking",waybill]`, `["admin","notifications"]`.

- [ ] **Step 1: Write the API helper module**

```ts
// app/admin/orders/api.ts
import type { OrderStatus } from "@/lib/types/order";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface AdminOrderItem {
  id?: string;
  sku?: string | null;
  size?: string | null;
  quantity?: number | null;
}
export interface AdminPayment {
  payment_method?: string | null;
  status?: string | null;
}
export interface AdminOrder {
  id: string;
  order_number?: string | null;
  user_id: string;
  status: OrderStatus;
  fulfilment_method?: "delivery" | "pickup" | null;
  total_amount?: number | null;
  created_at?: string | null;
  tracking_number?: string | null;
  carrier_name?: string | null;
  delivery_notes?: string | null;
  estimated_delivery_date?: string | null;
  delhivery_latest_status?: string | null;
  delhivery_latest_scan_at?: string | null;
  delhivery_latest_location?: string | null;
  shipping_address?: { full_name?: string; phone?: string } | null;
  customer_phone?: string | null;
  items: AdminOrderItem[];
  payments: AdminPayment[];
  bill_url: string | null;
}
export interface AdminOrdersListResponse {
  orders: AdminOrder[];
  total: number;
}
export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at?: string | null;
}

export interface OrderFilters {
  status: string; // 'all' or an OrderStatus
  fulfilment: string; // 'all' | 'delivery' | 'pickup'
  days: number | null; // 7 | 30 | 90 | null (= all time)
  offset: number;
}

export const PAGE_SIZE = 50;

export function listUrl(f: OrderFilters): string {
  const p = new URLSearchParams();
  p.set("limit", String(PAGE_SIZE));
  p.set("offset", String(f.offset));
  if (f.status !== "all") p.set("status", f.status);
  if (f.fulfilment !== "all") p.set("fulfilment", f.fulfilment);
  if (f.days) {
    const from = new Date(Date.now() - f.days * 86_400_000);
    p.set("from_date", from.toISOString().slice(0, 10));
  }
  return `/api/admin/orders?${p.toString()}`;
}

export function matchesSearch(o: AdminOrder, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return [o.order_number, o.id, o.tracking_number, o.shipping_address?.full_name, o.shipping_address?.phone, o.customer_phone]
    .some((v) => (v || "").toLowerCase().includes(needle));
}
```

- [ ] **Step 2: Write the failing tests (page gate + client smoke + search helper)**

```tsx
// app/admin/orders/page.test.tsx — same shape as the Task 10 gate test
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("./orders-client", () => ({ default: () => null }));

import AdminOrdersPage from "./page";

beforeEach(() => { h.user = null; });

describe("/admin/orders gate", () => {
  it("redirects anonymous users to /login", async () => {
    await expect(AdminOrdersPage()).rejects.toThrow("REDIRECT:/login?redirect=/admin/orders");
  });
  it("redirects non-admins to /", async () => {
    h.user = { id: "u-1", app_metadata: { role: "customer" } };
    await expect(AdminOrdersPage()).rejects.toThrow(/REDIRECT:\/$/);
  });
  it("renders for admins", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    await expect(AdminOrdersPage()).resolves.toBeTruthy();
  });
});
```

```tsx
// app/admin/orders/orders-client.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrdersClient from "./orders-client";
import { matchesSearch, type AdminOrder } from "./api";

const order: AdminOrder = {
  id: "o-1",
  order_number: "ORD-20260928-120000-00001",
  user_id: "u-1",
  status: "processing",
  fulfilment_method: "delivery",
  total_amount: 999,
  created_at: "2026-09-28T10:00:00Z",
  tracking_number: "WB1",
  carrier_name: "Delhivery",
  shipping_address: { full_name: "Asha", phone: "8888888888" },
  items: [{ sku: "frock-red-2-3y", quantity: 1 }],
  payments: [],
  bill_url: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/api/admin/notifications")
        ? { notifications: [], unread: 0 }
        : { orders: [order], total: 1 };
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
});

function renderClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrdersClient />
    </QueryClientProvider>
  );
}

describe("OrdersClient", () => {
  it("renders fetched orders", async () => {
    renderClient();
    expect(await screen.findByText(/ORD-20260928-120000-00001/)).toBeInTheDocument();
    expect(screen.getByText(/Asha/)).toBeInTheDocument();
  });
});

describe("matchesSearch", () => {
  it("matches order number, AWB, name, phone; empty query matches all", () => {
    expect(matchesSearch(order, "")).toBe(true);
    expect(matchesSearch(order, "wb1")).toBe(true);
    expect(matchesSearch(order, "asha")).toBe(true);
    expect(matchesSearch(order, "8888")).toBe(true);
    expect(matchesSearch(order, "nope")).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (modules missing)

Run: `npx vitest run app/admin/orders`

- [ ] **Step 4: Implement the server page**

```tsx
// app/admin/orders/page.tsx
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import OrdersClient from "./orders-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Orders — Admin",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/orders");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/"); // Non-admins should not learn this page exists.

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <OrdersClient />
    </div>
  );
}
```

- [ ] **Step 5: Implement the client components**

```tsx
// app/admin/orders/orders-client.tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatOrderStatus, getOrderStatusColor } from "@/lib/utils/order-status";
import {
  api, listUrl, matchesSearch, PAGE_SIZE,
  type AdminOrder, type AdminOrdersListResponse, type OrderFilters,
} from "./api";
import OrderDetailDialog from "./order-detail-dialog";
import NotificationsPanel from "./notifications-panel";

const STATUS_FILTERS = ["all", "payment_pending", "verifying_payment", "payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded"] as const;
const DAY_PRESETS: { label: string; days: number | null }[] = [
  { label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }, { label: "All", days: null },
];

export default function OrdersClient() {
  const [filters, setFilters] = useState<OrderFilters>({ status: "all", fulfilment: "all", days: 7, offset: 0 });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery<AdminOrdersListResponse>({
    queryKey: ["admin", "orders", filters],
    queryFn: () => api<AdminOrdersListResponse>(listUrl(filters)),
    staleTime: 30_000,
  });

  const orders = (data?.orders ?? []).filter((o) => matchesSearch(o, search));
  const total = data?.total ?? 0;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Orders</h1>
        <NotificationsPanel />
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Status filter"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, offset: 0 }))}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : formatOrderStatus(s)}</option>
          ))}
        </select>
        <select
          aria-label="Fulfilment filter"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filters.fulfilment}
          onChange={(e) => setFilters((f) => ({ ...f, fulfilment: e.target.value, offset: 0 }))}
        >
          <option value="all">Delivery + pickup</option>
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
        </select>
        <div className="flex gap-1">
          {DAY_PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={filters.days === p.days ? "default" : "outline"}
              onClick={() => setFilters((f) => ({ ...f, days: p.days, offset: 0 }))}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Input
        placeholder="Search order #, AWB, name, phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isPending && <p className="text-sm text-muted-foreground">Loading orders…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id}>
            <button
              className="w-full rounded-lg border p-3 text-left hover:bg-accent"
              onClick={() => setSelectedId(o.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">#{o.order_number || o.id.slice(0, 8)}</span>
                <Badge className={getOrderStatusColor(o.status)}>{formatOrderStatus(o.status)}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>{o.shipping_address?.full_name || "—"} · {o.items.length} item{o.items.length === 1 ? "" : "s"}</span>
                <span>₹{o.total_amount ?? 0}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{o.fulfilment_method === "pickup" ? "Stall pickup" : "Delivery"}</span>
                {o.tracking_number && <span>{o.carrier_name || "AWB"}: {o.tracking_number}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {!isPending && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders match.</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <Button
          size="sm" variant="outline"
          disabled={filters.offset === 0}
          onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE_SIZE) }))}
        >
          Previous
        </Button>
        <span className="text-muted-foreground">
          {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} of {total}
        </span>
        <Button
          size="sm" variant="outline"
          disabled={filters.offset + PAGE_SIZE >= total}
          onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE_SIZE }))}
        >
          Next
        </Button>
      </div>

      <OrderDetailDialog order={selected} onClose={() => setSelectedId(null)} onChanged={refresh} />
    </div>
  );
}
```

```tsx
// app/admin/orders/order-detail-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatOrderStatus } from "@/lib/utils/order-status";
import type { OrderStatus } from "@/lib/types/order";
import { api, ApiError, type AdminOrder } from "./api";
import TrackingPanel from "./tracking-panel";

const ALL_STATUSES: OrderStatus[] = [
  "payment_pending", "verifying_payment", "payment_confirmed", "processing",
  "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded",
];

export default function OrderDetailDialog({
  order, onClose, onChanged,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setStatus(order?.status ?? "");
    setTracking(order?.tracking_number ?? "");
    setNotes(order?.delivery_notes ?? "");
  }, [order]);

  const onError = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : "Request failed — check your connection");

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/admin/orders/${order!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { toast.success("Order updated"); onChanged(); },
    onError,
  });

  const createShipment = useMutation({
    mutationFn: () =>
      api<{ waybill: string }>(`/api/admin/orders/${order!.id}/shipment`, { method: "POST" }),
    onSuccess: (d) => { toast.success(`Shipment created: ${d.waybill}`); onChanged(); },
    onError,
  });

  const cancelShipment = useMutation({
    mutationFn: () => api(`/api/admin/orders/${order!.id}/shipment`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Shipment cancelled"); onChanged(); },
    onError,
  });

  if (!order) return null;
  const isDelhivery = Boolean(order.tracking_number) &&
    (!order.carrier_name || order.carrier_name.toLowerCase().includes("delhivery"));
  const canCreateShipment =
    order.fulfilment_method !== "pickup" &&
    !isDelhivery &&
    (order.status === "payment_confirmed" || order.status === "processing");
  const busy = save.isPending || createShipment.isPending || cancelShipment.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>#{order.order_number || order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">{order.shipping_address?.full_name || "—"}</p>
            <p className="text-muted-foreground">
              {order.shipping_address?.phone || order.customer_phone || ""} · ₹{order.total_amount ?? 0}
            </p>
            <ul className="mt-1 text-muted-foreground">
              {order.items.map((it, i) => (
                <li key={it.id ?? i}>{it.sku || "item"}{it.size ? ` · ${it.size}` : ""} × {it.quantity ?? 1}</li>
              ))}
            </ul>
          </div>

          <label className="block">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === "verifying_payment" && order.status !== "verifying_payment"}>
                  {formatOrderStatus(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">Tracking number</span>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Delivery notes</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" disabled={busy}
              onClick={() =>
                save.mutate({
                  ...(status && status !== order.status ? { status } : {}),
                  ...(tracking !== (order.tracking_number ?? "") ? { tracking_number: tracking || null } : {}),
                  ...(notes !== (order.delivery_notes ?? "") ? { delivery_notes: notes || null } : {}),
                })
              }
            >
              Save
            </Button>
            {canCreateShipment && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => createShipment.mutate()}>
                Create Delhivery shipment
              </Button>
            )}
            {isDelhivery && (
              <>
                <Button
                  size="sm" variant="outline"
                  onClick={() => window.open(`/admin/print/label/${order.order_number || order.id}?autoPrint=true`, "_blank")}
                >
                  Print label
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => cancelShipment.mutate()}>
                  Cancel shipment
                </Button>
              </>
            )}
            {order.bill_url && (
              <Button size="sm" variant="outline" onClick={() => window.open(order.bill_url!, "_blank")}>
                Bill PDF
              </Button>
            )}
          </div>

          {isDelhivery && <TrackingPanel order={order} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// app/admin/orders/tracking-panel.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderShipmentTrackingData } from "@/lib/types/delhivery-tracking";
import { api, type AdminOrder } from "./api";

export default function TrackingPanel({ order }: { order: AdminOrder }) {
  const waybill = order.tracking_number!;
  const { data, isPending, error, refetch } = useQuery<{ tracking: OrderShipmentTrackingData; cached: boolean }>({
    queryKey: ["admin", "delhivery", "tracking", waybill],
    queryFn: () =>
      api(`/api/admin/shipping/tracking?waybill=${encodeURIComponent(waybill)}&order_id=${order.id}`),
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const scans = data?.tracking.scans ?? [];
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">
          Delhivery {waybill} — {data?.tracking.currentStatus || order.delhivery_latest_status || "…"}
        </p>
        <button className="text-xs underline" onClick={() => refetch()}>Refresh</button>
      </div>
      {isPending && <p className="text-xs text-muted-foreground">Loading tracking…</p>}
      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {scans.slice(0, 5).map((s, i) => (
          <li key={i}>
            {s.status}{s.location ? ` — ${s.location}` : ""}{s.timestamp ? ` · ${new Date(s.timestamp).toLocaleString("en-IN", { hour12: false })}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// app/admin/orders/notifications-panel.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError, type AdminNotification } from "./api";

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery<{ notifications: AdminNotification[]; unread: number }>({
    queryKey: ["admin", "notifications"],
    queryFn: () => api("/api/admin/notifications"),
    staleTime: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to mark read"),
  });

  const unread = data?.unread ?? 0;
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        Scans{unread > 0 ? ` (${unread})` : ""}
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-80 rounded-md border bg-background p-2 shadow-md">
          {(data?.notifications ?? []).length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No shipment notifications.</p>
          )}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {(data?.notifications ?? []).map((n) => (
              <li key={n.id} className={`rounded p-2 text-xs ${n.read ? "opacity-60" : "bg-accent"}`}>
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.message}</p>
                {!n.read && (
                  <button className="mt-1 underline" onClick={() => markRead.mutate(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the menu link**

In `components/HamburgerSheet.tsx`, find the admin menu block (around lines 298–315, the `<MenuItem href="/admin/pickup-orders">…` group). Duplicate the pickup-orders `MenuItem` line directly above it, changing the href to `/admin/orders` and the label to `Orders`. Keep the same admin-role conditional wrapper the siblings use.

- [ ] **Step 7: Run tests + lint**

Run: `npx vitest run app/admin/orders` — expect PASS.
Run: `npm run lint` — expect no new errors.

- [ ] **Step 8: Manual smoke (optional but cheap)**

`npm run dev`, sign in as an admin, open `http://localhost:3000/admin/orders`: list renders, filters work, detail dialog saves a note. (No Playwright per standing preference.)

- [ ] **Step 9: Commit**

```bash
git add app/admin/orders components/HamburgerSheet.tsx
git commit -m "feat(admin): orders management page with shipments, tracking and scan notifications"
```

---

### Task 12: QStash processor schedule script

**Files:**
- Create: `scripts/qstash-upsert-delhivery-processor-schedule.ts` (copied from `$ADMIN/scripts/qstash-upsert-delhivery-processor-schedule.ts`, edited)
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: `@upstash/qstash` `Client` (already a dependency), env `QSTASH_URL`, `QSTASH_TOKEN`, optional `QSTASH_DELHIVERY_PROCESSOR_URL`, `QSTASH_PROCESSOR_CRON`.
- Produces: npm script `qstash:schedule-delhivery` that upserts the QStash schedule `delhivery-webhook-processor` (default cron `CRON_TZ=Asia/Kolkata 0 8,12,16,20 * * *`, 4 runs/day — well inside the 1,000 msgs/day QStash budget) pointing at `POST <site>/api/internal/webhooks/delhivery/process`.

- [ ] **Step 1: Copy and edit the script**

```bash
cp ../cozyberries-admin/scripts/qstash-upsert-delhivery-processor-schedule.ts scripts/qstash-upsert-delhivery-processor-schedule.ts
```

Edits:
1. The destination default must resolve, in order: `QSTASH_DELHIVERY_PROCESSOR_URL`, then `` `${process.env.CATALOG_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://cozyberries.in"}/api/internal/webhooks/delhivery/process` `` (this repo sets `CATALOG_BASE_URL`, not `NEXT_PUBLIC_SITE_URL`).
2. The QStash client must be `new Client({ baseUrl: process.env.QSTASH_URL, token: process.env.QSTASH_TOKEN })` — `QSTASH_URL` is mandatory here (regional account: without it the SDK hits the default endpoint and fails with "user not found in this region"). Exit with a clear error if either is unset.
3. Confirm the `scheduleId` contains no `':'` (QStash dedup/schedule ids must not) — `delhivery-webhook-processor` is fine.

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, next to the existing `qstash:setup` entry, add:

```json
"qstash:schedule-delhivery": "npx tsx scripts/qstash-upsert-delhivery-processor-schedule.ts"
```

(If `tsx` is unavailable, match however `qstash:setup` runs its script — use the same runner.)

- [ ] **Step 3: Verify it compiles and fails cleanly without env**

Run: `npx tsc --noEmit 2>&1 | grep qstash` — expect no errors.
Run: `npm run qstash:schedule-delhivery` **without** QStash env — expect a clean "missing QSTASH_TOKEN/QSTASH_URL" error, not a stack trace. (Do NOT run it with real credentials now; the schedule is created at cutover.)

- [ ] **Step 4: Commit**

```bash
git add scripts/qstash-upsert-delhivery-processor-schedule.ts package.json
git commit -m "feat(shipping): QStash schedule script for the Delhivery webhook processor"
```

---

### Task 13: CLAUDE.md + cutover runbook

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/superpowers/plans/2026-09-28-admin-merge-cutover-runbook.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–12.
- Produces: updated repo instructions and the ordered manual cutover checklist the user executes.

- [ ] **Step 1: Update CLAUDE.md**

Apply these edits:

1. **"This Repo's Role" section:** replace the two sentences that say the admin portal lives in `../cozyberries-admin/` ("The **admin portal** lives in a sibling repo … Do not add admin-only operations here.") with:

```markdown
Admin order management lives in this repo too (`/admin/orders`, `/admin/pickup-orders`,
`/admin/on-behalf-orders`, `/admin/stall-refills`): the former admin app
(admin.cozyberries.com) was merged here on 2026-09-28 and then deleted. Admin identity is
`auth.users.app_metadata.role` only — the old `admin_users` bcrypt login is gone.
```

2. **Service-role register** (the bullet list under the `SUPABASE_SERVICE_ROLE_KEY` paragraph): the existing "Admin-gated routes" bullet already covers `/api/admin/*`; extend its examples with "(orders list/edit, shipments, tracking, broadcast notifications)". Add one new bullet at the end:

```markdown
- **Signed webhook intake** — `POST /api/webhooks/delhivery` (the `x-delhivery-token`
  header, compared constant-time, is the authorisation) and
  `POST /api/internal/webhooks/delhivery/process` (QStash signature or
  `INTERNAL_JOB_TOKEN` HMAC). No session exists; writes are limited to
  `webhook_events` and broadcast `notifications` rows (`user_id IS NULL`).
```

3. **Route Structure block:** add these lines:

```
  /admin/orders              # Admin order management (server-gated by role)
  /admin/print/label/[orderId]  # Delhivery label print page
  /api/admin/orders/*        # Admin orders list/edit + shipment create/cancel
  /api/admin/shipping/tracking  # Admin live Delhivery tracking (Redis 90s cache)
  /api/admin/notifications/*    # Broadcast (user_id null) shipment-scan notifications
  /api/webhooks/delhivery    # Delhivery scan intake (x-delhivery-token)
  /api/internal/webhooks/delhivery/process  # QStash-signed queue processor
```

4. **Shipping Integration section:** retitle "(Delhivery — Phase 1)" to "(Delhivery)", delete the line "Shipment creation remains in the admin app; storefront only displays tracking when `tracking_number` is set", and add:

```markdown
- **Shipment creation/cancel (admin):** `POST|DELETE /api/admin/orders/[id]/shipment`.
  Cancelling a shipment clears the tracking fields but never changes order status.
- **Webhook pipeline:** Delhivery scan events → `POST /api/webhooks/delhivery`
  (`DELHIVERY_WEBHOOK_TOKEN`) → `webhook_events` queue → QStash schedule
  `delhivery-webhook-processor` (`npm run qstash:schedule-delhivery`) →
  `POST /api/internal/webhooks/delhivery/process` → broadcast notification rows shown
  on `/admin/orders`.
- Additional env vars (server-only): `DELHIVERY_WAREHOUSE_NAME`,
  `DELHIVERY_WEBHOOK_TOKEN`, `INTERNAL_JOB_TOKEN`.
```

5. **Commands block:** add `npm run qstash:schedule-delhivery  # (once) upsert the Delhivery processor schedule`.

- [ ] **Step 2: Write the cutover runbook**

Create `docs/superpowers/plans/2026-09-28-admin-merge-cutover-runbook.md`:

```markdown
# Admin-merge cutover runbook

Ordered manual steps. Do not reorder: the webhook repoint (2) must land after the
deploy (1), and the deletions (5–7) only after verification (4).

## 1. Deploy + env
- [ ] Merge the feature branch to `develop` and `main`, push (per repo convention).
- [ ] Vercel (storefront project) → Settings → Environment Variables, add for
      Production: `DELHIVERY_WAREHOUSE_NAME` (copy value from the admin Vercel
      project), `DELHIVERY_WEBHOOK_TOKEN` (copy), `INTERNAL_JOB_TOKEN` (copy, or
      mint 32+ random bytes: `openssl rand -hex 32`).
- [ ] Redeploy and confirm `https://cozyberries.in/admin/orders` loads for an admin.
- [ ] Apply `supabase/migrations/20260928100000_delhivery_webhook_pipeline.sql` via the
      Supabase Dashboard SQL editor (runs as `postgres`). It is idempotent.

## 2. Repoint the pipeline
- [ ] Delhivery dashboard (or account manager): change the scan-webhook URL to
      `https://cozyberries.in/api/webhooks/delhivery` (same `x-delhivery-token`).
- [ ] Run `npm run qstash:schedule-delhivery` with prod env
      (`QSTASH_URL`, `QSTASH_TOKEN` from Vercel) — upserts the schedule to the new URL.
- [ ] Delete the old QStash schedule if the id differs (Upstash console → QStash →
      Schedules).

## 3. Drain the old queue
- [ ] Trigger the OLD admin processor once more (or wait for its last schedule) so
      no pending `webhook_events` rows are stranded mid-lease, then disable the old
      schedule.

## 4. Verify end-to-end
- [ ] `curl -X POST https://cozyberries.in/api/webhooks/delhivery \
        -H "x-delhivery-token: $DELHIVERY_WEBHOOK_TOKEN" -H "content-type: application/json" \
        -d '{"AWB":"TEST-CUTOVER","Status":"In Transit","StatusDateTime":"2026-09-28T12:00:00+05:30"}'`
      → expect `202 {"ok":true}`.
- [ ] Trigger the processor manually (internal HMAC):
      `TS=$(date +%s000); SIG=$(printf "%s:/api/internal/webhooks/delhivery/process" "$TS" | \
        openssl dgst -sha256 -hmac "$INTERNAL_JOB_TOKEN" -hex | awk '{print $2}'); \
        curl -X POST https://cozyberries.in/api/internal/webhooks/delhivery/process \
        -H "x-internal-job-token: $INTERNAL_JOB_TOKEN" -H "x-job-ts: $TS" -H "x-job-sig: $SIG"`
      → expect `{"ok":true,"result":{...}}` with `processed >= 1`.
- [ ] Open `/admin/orders` → the Scans panel shows "Shipment scan: In Transit — AWB
      TEST-CUTOVER". Mark it read.
- [ ] Create one real shipment from `/admin/orders` on a paid delivery order; print its
      label; cancel it if it was a test.

## 5. Drop the old login table
- [ ] Apply `supabase/migrations/20260928110000_drop_admin_users.sql` in the SQL editor.
- [ ] Run `npm run db:lint` (expect ERROR=0) and `npm run db:probe`.

## 6. Delete the admin deployment
- [ ] Vercel: delete project `prj_jb2I2WJeK5whNkcKN6ooEU9rL6xO` (cozyberries-admin).
- [ ] DNS: remove the `admin.cozyberries.com` record.

## 7. Delete the admin repo
- [ ] Safety net: `cd ../cozyberries-admin && git bundle create ../cozyberries-admin-final.bundle --all`
- [ ] Delete the GitHub repo (Settings → Danger Zone) using the cozyberries account.
- [ ] `rm -rf ../cozyberries-admin`
- [ ] Update Claude memory: mark the merge done; retire admin-repo references.
```

- [ ] **Step 3: Commit** (docs/superpowers is gitignored — force-add)

```bash
git add CLAUDE.md
git add -f docs/superpowers/plans/2026-09-28-admin-merge-cutover-runbook.md
git commit -m "docs: admin-merge CLAUDE.md updates and cutover runbook"
```

---

### Task 14: Full verification pass

**Files:** none new.

- [ ] **Step 1: Full unit suite**

Run: `npm run test:unit`
Expected: PASS, including every pre-existing test (nothing in Tasks 1–13 may regress the stall-pickup, catalog or invoice suites).

- [ ] **Step 2: Lint + types + build**

Run: `npm run lint` — no errors.
Run: `npx tsc --noEmit` — no errors.
Run: `npm run build` — succeeds. Pay attention that the build stays green **without** any Delhivery env vars set (the lazy config is the guard; a module-load env read will break this step).

- [ ] **Step 3: DB checks once more**

Run: `npm run db:lint` and `npm run db:probe` — same results as Task 2.

- [ ] **Step 4: Commit any stragglers and stop**

```bash
git status --short   # expect clean except intentionally-unstaged local files (d.txt, node-jiti/)
```

Do NOT merge to `develop`/`main` and do NOT push — that is the user's "ship" call, and cutover follows the runbook (Task 13).




