# Admin Shell and Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `/admin` section with its own phone-first shell, a shared component kit, the four existing admin pages rebuilt on that kit, a `super_admin`-only admins page, a dashboard home with action counts, and phone linking so admins can sign in by mobile.

**Architecture:** `app/admin/layout.tsx` gates every admin route on the server (`getUser()` + `isAdmin()`) and wraps pages in a client `AdminShell` (top bar, tab row, bottom bar). Pages are rebuilt on `components/admin/kit/*`, which wraps shadcn primitives with the `cb-*` tokens. New API routes follow the admin-gated shape: `requireAdmin()` / `requireSuperAdmin()` first, service role after, writes scoped by the id acted on.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, shadcn/ui + Tailwind (`cb-*` tokens), Supabase Auth admin API, Upstash Redis (`UpstashService`), vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-admin-shell-redesign-design.md`

## Global Constraints

- Branch: `feature/admin-shell-redesign` (already created from `develop`). Commit after every task; never push or merge unless the user says so.
- Every behaviour gets an automated test (vitest or Playwright). No manual verification.
- `SUPABASE_SERVICE_ROLE_KEY` is used only after `requireAdmin()` / `requireSuperAdmin()` passes, and every write is scoped by the row id the admin acted on.
- No new database table, no migration.
- Free tiers only: the dashboard actions route is cached in Redis for 60 s under `admin:dashboard:actions`.
- Phone-first: design at 375 px, then widen. Bottom bar hidden at `lg`.
- Style: warm on-brand tokens (`cb-cream`, `cb-white`, `cb-fg`, `cb-muted-fg`, `cb-border`, `cb-linen`, `cb-terracotta`). Status colours via `getOrderStatusColor`.
- Pages import kit components for the listed patterns instead of shadcn primitives directly.
- Nothing under `lib/catalog/` is touched.
- Component tests start with `// @vitest-environment jsdom`. Run a single file with `npx vitest run <path>`.
- Copy: `super_admin` only sees the "Admins" tab; making a `super_admin` remains a Supabase Dashboard action.

## Review Focus

1. An admin whose token still says `admin` after removal must be refused by the API (`getUser()` reads the live account). Pinned in Task 4 (`requireSuperAdmin` reads `getUser()`, not the JWT) and Task 14 (DELETE then GET as that user).
2. A phone number already on another account must not be re-linked. Pinned in Task 16 (409 on send and on verify).
3. Print pages must not get the shell. Pinned in Task 5 (`AdminShell` renders bare children for `/admin/print/*`).
4. The order detail form must not lose edits on a background refetch. Pinned in Task 10 (id-keyed resync test kept).
5. The dashboard cache must clear when an order or pickup status changes. Pinned in Task 7 (PATCH routes call `clearDashboardActions()`).

---

### Task 1: Kit part 1 — StatusPill, PageHeader, EmptyState, LoadingList, ErrorBanner

**Files:**
- Create: `components/admin/kit/StatusPill.tsx`
- Create: `components/admin/kit/PageHeader.tsx`
- Create: `components/admin/kit/EmptyState.tsx`
- Create: `components/admin/kit/LoadingList.tsx`
- Create: `components/admin/kit/ErrorBanner.tsx`
- Create: `components/admin/kit/index.ts`
- Test: `components/admin/kit/kit-basics.test.tsx`

**Interfaces:**
- Produces:
  - `StatusPill({ status: string })`
  - `PageHeader({ title: string; subtitle?: string; action?: ReactNode })`
  - `EmptyState({ title: string; hint?: string; icon?: ReactNode })`
  - `LoadingList({ rows?: number; label?: string })` renders `role="status"` with `aria-label={label}` (default `"Loading"`)
  - `ErrorBanner({ message: string; onRetry?: () => void; retrying?: boolean; loginRedirect?: string })` — when `loginRedirect` is set it renders a link "Log in again" to `/login?redirect=<loginRedirect>` instead of Retry.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/admin/kit/kit-basics.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusPill, PageHeader, EmptyState, LoadingList, ErrorBanner } from "./index";

describe("StatusPill", () => {
  it("formats the status and uses the shared colour map", () => {
    render(<StatusPill status="ready_for_pickup" />);
    const pill = screen.getByText("Ready For Pickup");
    expect(pill.className).toContain("bg-teal-100");
  });
});

describe("PageHeader", () => {
  it("renders title, subtitle and the action slot", () => {
    render(<PageHeader title="Orders" subtitle="Last 7 days" action={<button>Scans</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scans" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows title and hint", () => {
    render(<EmptyState title="No orders match" hint="Try a wider date range" />);
    expect(screen.getByText("No orders match")).toBeInTheDocument();
    expect(screen.getByText("Try a wider date range")).toBeInTheDocument();
  });
});

describe("LoadingList", () => {
  it("is announced as a status with the given label and row count", () => {
    const { container } = render(<LoadingList rows={3} label="Loading orders" />);
    expect(screen.getByRole("status", { name: "Loading orders" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
  });
});

describe("ErrorBanner", () => {
  it("shows the message and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Couldn't refresh" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't refresh");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers a login link instead of retry when the session is gone", () => {
    render(<ErrorBanner message="Signed out" loginRedirect="/admin/orders" />);
    expect(screen.getByRole("link", { name: "Log in again" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fadmin%2Forders",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/admin/kit/kit-basics.test.tsx`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement the five components and the barrel**

```tsx
// components/admin/kit/StatusPill.tsx
import { formatOrderStatus, getOrderStatusColor } from "@/lib/utils/order-status";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOrderStatusColor(status)}`}
    >
      {formatOrderStatus(status)}
    </span>
  );
}
```

```tsx
// components/admin/kit/PageHeader.tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-[88px] z-10 -mx-4 mb-4 flex items-start justify-between gap-3 bg-cb-cream/95 px-4 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-cb-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-cb-muted-fg">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

```tsx
// components/admin/kit/EmptyState.tsx
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cb-border bg-cb-white/60 px-4 py-10 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-cb-linen text-cb-muted-fg">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-cb-fg">{title}</p>
      {hint && <p className="mt-1 text-sm text-cb-muted-fg">{hint}</p>}
    </div>
  );
}
```

```tsx
// components/admin/kit/LoadingList.tsx
export function LoadingList({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          data-skeleton-row
          className="animate-pulse rounded-2xl border border-cb-border bg-cb-white p-4"
        >
          <div className="mb-2 h-4 w-2/5 rounded bg-cb-linen" />
          <div className="mb-3 h-3 w-3/5 rounded bg-cb-linen" />
          <div className="h-9 w-full rounded-xl bg-cb-linen" />
        </div>
      ))}
    </div>
  );
}
```

```tsx
// components/admin/kit/ErrorBanner.tsx
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorBanner({
  message,
  onRetry,
  retrying = false,
  loginRedirect,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  loginRedirect?: string;
}) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {loginRedirect ? (
        <Button asChild size="sm" variant="outline" className="self-start rounded-full">
          <a href={`/login?redirect=${encodeURIComponent(loginRedirect)}`}>Log in again</a>
        </Button>
      ) : (
        onRetry && (
          <Button size="sm" variant="outline" className="self-start rounded-full" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Retrying…
              </>
            ) : (
              "Retry"
            )}
          </Button>
        )
      )}
    </div>
  );
}
```

```ts
// components/admin/kit/index.ts
export { StatusPill } from "./StatusPill";
export { PageHeader } from "./PageHeader";
export { EmptyState } from "./EmptyState";
export { LoadingList } from "./LoadingList";
export { ErrorBanner } from "./ErrorBanner";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/admin/kit/kit-basics.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/kit
git commit -m "feat(admin): kit basics — StatusPill, PageHeader, EmptyState, LoadingList, ErrorBanner"
```

---

### Task 2: Kit part 2 — SegmentedTabs, FilterChips, StatTile, StatGrid

**Files:**
- Create: `components/admin/kit/SegmentedTabs.tsx`
- Create: `components/admin/kit/FilterChips.tsx`
- Create: `components/admin/kit/StatTile.tsx`
- Modify: `components/admin/kit/index.ts`
- Test: `components/admin/kit/kit-controls.test.tsx`

**Interfaces:**
- Produces:
  - `SegmentedTab<K> = { key: K; label: string; count?: number }`; `SegmentedTabs<K extends string>({ tabs, value, onChange, label })` renders `role="tablist"` with `aria-label={label}` and buttons `role="tab"` `aria-selected`.
  - `FilterChip<V> = { value: V; label: string }`; `FilterChips<V extends string>({ chips, value, onChange, label })` renders `role="radiogroup"` with buttons `role="radio"` `aria-checked`.
  - `StatTile({ label, value, hint?, href?, tone? })`, `StatGrid({ children })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/admin/kit/kit-controls.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedTabs, FilterChips, StatTile, StatGrid } from "./index";

describe("SegmentedTabs", () => {
  it("marks the active tab, shows counts and reports changes", () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        label="Pickup queue"
        tabs={[
          { key: "awaiting", label: "Awaiting ✅", count: 2 },
          { key: "ready", label: "Ready", count: 0 },
        ]}
        value="ready"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("tablist", { name: "Pickup queue" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ready" })).toHaveAttribute("aria-selected", "true");
    const awaiting = screen.getByRole("tab", { name: /Awaiting/ });
    expect(awaiting).toHaveTextContent("2");
    fireEvent.click(awaiting);
    expect(onChange).toHaveBeenCalledWith("awaiting");
  });
});

describe("FilterChips", () => {
  it("is a radiogroup with one checked chip", () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="Days"
        chips={[
          { value: "7", label: "7d" },
          { value: "30", label: "30d" },
        ]}
        value="7"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "7d" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "30d" }));
    expect(onChange).toHaveBeenCalledWith("30");
  });
});

describe("StatTile", () => {
  it("renders as a link when href is given", () => {
    render(
      <StatGrid>
        <StatTile label="Awaiting ✅" value={3} href="/admin/pickup-orders" tone="attention" />
        <StatTile label="To ship" value={0} />
      </StatGrid>,
    );
    const link = screen.getByRole("link", { name: /Awaiting/ });
    expect(link).toHaveAttribute("href", "/admin/pickup-orders");
    expect(link).toHaveTextContent("3");
    expect(screen.getByText("To ship")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/admin/kit/kit-controls.test.tsx`
Expected: FAIL — `SegmentedTabs` is not exported.

- [ ] **Step 3: Implement**

```tsx
// components/admin/kit/SegmentedTabs.tsx
"use client";

export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-xl bg-cb-linen p-1">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-cb-white text-cb-fg shadow-sm" : "text-cb-muted-fg"
            }`}
          >
            <span className="truncate">{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? "bg-cb-terracotta text-white" : "bg-cb-white text-cb-fg"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// components/admin/kit/FilterChips.tsx
"use client";

export interface FilterChip<V extends string> {
  value: V;
  label: string;
}

export function FilterChips<V extends string>({
  chips,
  value,
  onChange,
  label,
}: {
  chips: FilterChip<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {chips.map((c) => {
        const checked = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(c.value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              checked
                ? "border-cb-fg bg-cb-fg text-white"
                : "border-cb-border bg-cb-white text-cb-fg"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// components/admin/kit/StatTile.tsx
import type { ReactNode } from "react";
import Link from "next/link";

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: "default" | "attention";
}) {
  const attention = tone === "attention" && Number(value) > 0;
  const body = (
    <>
      <p className="text-xs font-medium text-cb-muted-fg">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${attention ? "text-cb-terracotta" : "text-cb-fg"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cb-muted-fg">{hint}</p>}
    </>
  );
  const className = `block rounded-2xl border bg-cb-white p-4 ${
    attention ? "border-cb-terracotta/40" : "border-cb-border"
  }`;
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
```

Append to `components/admin/kit/index.ts`:

```ts
export { SegmentedTabs, type SegmentedTab } from "./SegmentedTabs";
export { FilterChips, type FilterChip } from "./FilterChips";
export { StatTile, StatGrid } from "./StatTile";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/admin/kit`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/kit
git commit -m "feat(admin): kit controls — SegmentedTabs, FilterChips, StatTile"
```

---

### Task 3: Kit part 3 — ListCard and ActionSheet

**Files:**
- Create: `components/admin/kit/ListCard.tsx`
- Create: `components/admin/kit/ActionSheet.tsx`
- Create: `hooks/useIsDesktop.ts`
- Modify: `components/admin/kit/index.ts`
- Test: `components/admin/kit/kit-surfaces.test.tsx`

**Interfaces:**
- Produces:
  - `ListCard({ title, meta?, status?, children?, actions?, onClick?, testId?, dimmed? })`. With `onClick` the card body is a `<button>`; actions render in a row of full-width buttons below.
  - `ActionSheet({ open, onOpenChange, title, description?, children })`: shadcn `Sheet side="bottom"` below `lg`, `Dialog` at `lg` and up. `useIsDesktop()` returns `false` when `window.matchMedia` is absent (jsdom).

- [ ] **Step 1: Write the failing tests**

```tsx
// components/admin/kit/kit-surfaces.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListCard, ActionSheet } from "./index";

describe("ListCard", () => {
  it("renders title, meta, status and actions, and opens on tap", () => {
    const onClick = vi.fn();
    render(
      <ListCard
        title="#ORD-1"
        meta="Priya · ₹1,240"
        status="processing"
        onClick={onClick}
        actions={<button>Collected</button>}
        testId="order-1"
      />,
    );
    expect(screen.getByTestId("order-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /#ORD-1/ }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collected" })).toBeInTheDocument();
  });
});

describe("ActionSheet", () => {
  it("renders as a bottom sheet with an accessible title on phones", () => {
    render(
      <ActionSheet open onOpenChange={() => {}} title="Order #1" description="Edit status">
        <p>body</p>
      </ActionSheet>,
    );
    expect(screen.getByRole("dialog", { name: "Order #1" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/admin/kit/kit-surfaces.test.tsx`
Expected: FAIL — `ListCard` is not exported.

- [ ] **Step 3: Implement**

```ts
// hooks/useIsDesktop.ts
"use client";
import { useEffect, useState } from "react";

const QUERY = "(min-width: 1024px)";

/** True at Tailwind's `lg` and up. False on the server and in jsdom. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}
```

```tsx
// components/admin/kit/ListCard.tsx
"use client";
import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";

export function ListCard({
  title,
  meta,
  status,
  children,
  actions,
  onClick,
  testId,
  dimmed = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  testId?: string;
  dimmed?: boolean;
}) {
  const head = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug text-cb-fg">{title}</p>
        {status && <StatusPill status={status} />}
      </div>
      {meta && <p className="mt-0.5 text-sm text-cb-muted-fg">{meta}</p>}
    </>
  );
  return (
    <li
      data-testid={testId}
      className={`list-none rounded-2xl border border-cb-border bg-cb-white p-4 ${dimmed ? "opacity-60" : ""}`}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {head}
        </button>
      ) : (
        head
      )}
      {children && <div className="mt-2 text-sm text-cb-fg">{children}</div>}
      {actions && <div className="mt-3 flex flex-col gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:flex-1">{actions}</div>}
    </li>
  );
}
```

```tsx
// components/admin/kit/ActionSheet.tsx
"use client";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/useIsDesktop";

export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </SheetHeader>
        <div className="mt-3">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

Append to `components/admin/kit/index.ts`:

```ts
export { ListCard } from "./ListCard";
export { ActionSheet } from "./ActionSheet";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/admin/kit`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/kit hooks/useIsDesktop.ts
git commit -m "feat(admin): kit surfaces — ListCard and ActionSheet"
```

---
### Task 4: `requireSuperAdmin()` in the admin gate

**Files:**
- Modify: `lib/services/admin-gate.ts`
- Modify: `lib/services/effective-user.ts` (add `isSuperAdmin`)
- Test: `lib/services/admin-gate.test.ts`

**Interfaces:**
- Produces: `requireSuperAdmin(): Promise<{ user: SupabaseUser } | { response: NextResponse }>` — 401 when signed out, 403 when the live account's `app_metadata.role !== "super_admin"`. `isSuperAdmin(user: User): boolean` in `effective-user.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/services/admin-gate.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));

import { requireAdmin, requireSuperAdmin } from "./admin-gate";

beforeEach(() => {
  h.user = null;
});

describe("requireAdmin", () => {
  it("401s a guest", async () => {
    const r = await requireAdmin();
    expect(r.response?.status).toBe(401);
  });
  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    const r = await requireAdmin();
    expect(r.response?.status).toBe(403);
  });
  it("passes an admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    const r = await requireAdmin();
    expect(r.user?.id).toBe("a");
  });
});

describe("requireSuperAdmin", () => {
  it("401s a guest", async () => {
    const r = await requireSuperAdmin();
    expect(r.response?.status).toBe(401);
  });
  it("403s a plain admin, reading the live account not the token", async () => {
    // getUser() is what is mocked here: a stale JWT saying "admin" is irrelevant.
    h.user = { id: "a", app_metadata: { role: "admin" } };
    const r = await requireSuperAdmin();
    expect(r.response?.status).toBe(403);
  });
  it("passes a super_admin", async () => {
    h.user = { id: "s", app_metadata: { role: "super_admin" } };
    const r = await requireSuperAdmin();
    expect(r.user?.id).toBe("s");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/admin-gate.test.ts`
Expected: FAIL — `requireSuperAdmin` is not a function.

- [ ] **Step 3: Implement**

In `lib/services/effective-user.ts`, directly after `isAdmin`:

```ts
export function isSuperAdmin(user: User): boolean {
  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  return role === 'super_admin';
}
```

Replace `lib/services/admin-gate.ts` with:

```ts
import { NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";

type GateResult =
  | { user: SupabaseUser; response?: undefined }
  | { user?: undefined; response: NextResponse };

async function gate(check: (user: SupabaseUser) => boolean): Promise<GateResult> {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const typed = user as unknown as SupabaseUser;
  if (!check(typed)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: typed };
}

/**
 * The admin-route gate from CLAUDE.md: a server-verified session (getUser()) and an
 * admin role, both checked before the caller creates a service-role client.
 */
export function requireAdmin(): Promise<GateResult> {
  return gate(isAdmin);
}

/**
 * Same gate, but only `super_admin` passes. getUser() returns the live account, so a
 * demoted admin is refused at once even while their old JWT still says "admin".
 */
export function requireSuperAdmin(): Promise<GateResult> {
  return gate(isSuperAdmin);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/services/admin-gate.test.ts lib/services/effective-user.test.ts app/api/admin`
Expected: PASS — the existing admin route tests still pass through `requireAdmin`.

- [ ] **Step 5: Commit**

```bash
git add lib/services/admin-gate.ts lib/services/admin-gate.test.ts lib/services/effective-user.ts
git commit -m "feat(admin): requireSuperAdmin gate"
```

---

### Task 5: `AdminShell` and the nav model

**Files:**
- Create: `components/admin/nav.ts`
- Create: `components/admin/AdminShell.tsx`
- Test: `components/admin/nav.test.ts`
- Test: `components/admin/AdminShell.test.tsx`

**Interfaces:**
- Produces:
  - `ADMIN_TABS: readonly AdminTab[]` where `AdminTab = { href: string; label: string; exact?: boolean; bottom?: boolean; superAdminOnly?: boolean }`.
  - `isActiveTab(pathname: string, tab: AdminTab): boolean`.
  - `tabsForRole(role: AdminRole): AdminTab[]`, `AdminRole = "admin" | "super_admin"`.
  - `AdminShell({ role, hasPhone, userId, initials, children })` — client component. Renders bare `children` for pathnames starting `/admin/print`.
  - `PHONE_BANNER_KEY(userId) = \`admin-phone-banner-dismissed:${userId}\``.

- [ ] **Step 1: Write the failing tests**

```ts
// components/admin/nav.test.ts
import { describe, expect, it } from "vitest";
import { ADMIN_TABS, isActiveTab, tabsForRole } from "./nav";

describe("admin nav", () => {
  it("lists tabs in order with the bottom-bar four flagged", () => {
    expect(ADMIN_TABS.map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "On-behalf", "Impersonate", "Admins",
    ]);
    expect(ADMIN_TABS.filter((t) => t.bottom).map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills",
    ]);
  });
  it("hides Admins from a plain admin", () => {
    expect(tabsForRole("admin").some((t) => t.label === "Admins")).toBe(false);
    expect(tabsForRole("super_admin").some((t) => t.label === "Admins")).toBe(true);
  });
  it("matches Dashboard exactly and the others by prefix", () => {
    const dash = ADMIN_TABS[0];
    const orders = ADMIN_TABS[1];
    expect(isActiveTab("/admin", dash)).toBe(true);
    expect(isActiveTab("/admin/orders", dash)).toBe(false);
    expect(isActiveTab("/admin/orders", orders)).toBe(true);
    expect(isActiveTab("/admin/orders/abc", orders)).toBe(true);
  });
});
```

```tsx
// components/admin/AdminShell.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ signOut: vi.fn(async () => ({ success: true })) }),
}));

import AdminShell, { PHONE_BANNER_KEY } from "./AdminShell";

function renderShell(over: Partial<React.ComponentProps<typeof AdminShell>> = {}) {
  return render(
    <AdminShell role="admin" hasPhone userId="u1" initials="A" {...over}>
      <p>page</p>
    </AdminShell>,
  );
}

beforeEach(() => {
  nav.pathname = "/admin";
  window.localStorage.clear();
});

describe("AdminShell", () => {
  it("renders the tab row, bottom bar and page", () => {
    renderShell();
    expect(screen.getByRole("navigation", { name: "Admin sections" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Quick access" })).toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Store" })).toHaveAttribute("href", "/");
  });

  it("marks the current tab", () => {
    nav.pathname = "/admin/pickup-orders";
    renderShell();
    const tabs = screen.getByRole("navigation", { name: "Admin sections" });
    const active = tabs.querySelector('[aria-current="page"]');
    expect(active).toHaveTextContent("Pickups");
  });

  it("shows Admins only to a super_admin", () => {
    renderShell();
    expect(screen.queryByRole("link", { name: "Admins" })).not.toBeInTheDocument();
    renderShell({ role: "super_admin" });
    expect(screen.getByRole("link", { name: "Admins" })).toHaveAttribute("href", "/admin/admins");
  });

  it("renders bare children on print pages", () => {
    nav.pathname = "/admin/print/label/ORD-1";
    renderShell();
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).not.toBeInTheDocument();
  });

  it("shows the phone banner until dismissed, per user", () => {
    renderShell({ hasPhone: false });
    const banner = screen.getByRole("status", { name: "Add your phone" });
    expect(banner).toHaveTextContent("Add your phone to sign in by mobile");
    expect(screen.getByRole("link", { name: "Add phone" })).toHaveAttribute("href", "/profile#phone");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status", { name: "Add your phone" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PHONE_BANNER_KEY("u1"))).toBe("1");
  });

  it("does not show the phone banner when a phone is set", () => {
    renderShell({ hasPhone: true });
    expect(screen.queryByRole("status", { name: "Add your phone" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/admin/nav.test.ts components/admin/AdminShell.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the nav model**

```ts
// components/admin/nav.ts
export type AdminRole = "admin" | "super_admin";

export interface AdminTab {
  href: string;
  label: string;
  /** Match the pathname exactly instead of by prefix. */
  exact?: boolean;
  /** Also shown in the phone bottom bar. */
  bottom?: boolean;
  superAdminOnly?: boolean;
}

export const ADMIN_TABS: readonly AdminTab[] = [
  { href: "/admin", label: "Dashboard", exact: true, bottom: true },
  { href: "/admin/orders", label: "Orders", bottom: true },
  { href: "/admin/pickup-orders", label: "Pickups", bottom: true },
  { href: "/admin/stall-refills", label: "Refills", bottom: true },
  { href: "/admin/on-behalf-orders", label: "On-behalf" },
  { href: "/admin/impersonate", label: "Impersonate" },
  { href: "/admin/admins", label: "Admins", superAdminOnly: true },
];

export function isActiveTab(pathname: string, tab: AdminTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function tabsForRole(role: AdminRole): AdminTab[] {
  return ADMIN_TABS.filter((t) => !t.superAdminOnly || role === "super_admin");
}
```

- [ ] **Step 4: Implement the shell**

```tsx
// components/admin/AdminShell.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, LogOut, PackagePlus, Store, X } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_TABS, isActiveTab, tabsForRole, type AdminRole } from "./nav";

export const PHONE_BANNER_KEY = (userId: string) => `admin-phone-banner-dismissed:${userId}`;

const BOTTOM_ICONS: Record<string, typeof Store> = {
  "/admin": LayoutDashboard,
  "/admin/orders": ClipboardList,
  "/admin/pickup-orders": Store,
  "/admin/stall-refills": PackagePlus,
};

export default function AdminShell({
  role,
  hasPhone,
  userId,
  initials,
  children,
}: {
  role: AdminRole;
  hasPhone: boolean;
  userId: string;
  initials: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const { signOut } = useAuth();
  const tabs = tabsForRole(role);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    try {
      setBannerDismissed(window.localStorage.getItem(PHONE_BANNER_KEY(userId)) === "1");
    } catch {
      setBannerDismissed(false);
    }
  }, [userId]);

  if (pathname.startsWith("/admin/print")) return <>{children}</>;

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(PHONE_BANNER_KEY(userId), "1");
    } catch {
      /* private mode: banner returns next load, which is fine */
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen flex-col bg-cb-cream text-cb-fg">
      <header className="sticky top-0 z-20 bg-cb-white/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-12 items-center justify-between px-4">
          <Link href="/admin" className="flex items-baseline gap-1.5 font-semibold tracking-tight">
            CozyBerries <span className="text-xs font-medium uppercase tracking-wider text-cb-muted-fg">Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-cb-muted-fg">
              Store
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cb-taupe text-xs font-semibold text-white"
              >
                {initials}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut className="mr-2 h-4 w-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <nav aria-label="Admin sections" className="border-b border-cb-border bg-cb-white">
          <ul className="container mx-auto flex gap-1 overflow-x-auto px-4 py-2 lg:flex-wrap">
            {tabs.map((t) => {
              const active = isActiveTab(pathname, t);
              return (
                <li key={t.href} className="shrink-0">
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-full px-3 py-1.5 text-sm font-medium ${
                      active ? "bg-cb-fg text-white" : "text-cb-muted-fg hover:bg-cb-linen"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="container mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-2 lg:pb-8">
        {!hasPhone && !bannerDismissed && (
          <div
            role="status"
            aria-label="Add your phone"
            className="mb-4 flex items-center gap-3 rounded-2xl border border-cb-border bg-cb-white px-4 py-3 text-sm"
          >
            <span className="flex-1">Add your phone to sign in by mobile.</span>
            <Link href="/profile#phone" className="font-semibold text-cb-terracotta">
              Add phone
            </Link>
            <button type="button" aria-label="Dismiss" onClick={dismissBanner} className="text-cb-muted-fg">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        {children}
      </main>

      <nav
        aria-label="Quick access"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-cb-border bg-cb-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {ADMIN_TABS.filter((t) => t.bottom).map((t) => {
            const active = isActiveTab(pathname, t);
            const Icon = BOTTOM_ICONS[t.href] ?? Store;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                    active ? "text-cb-terracotta" : "text-cb-muted-fg"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run components/admin`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/nav.ts components/admin/nav.test.ts components/admin/AdminShell.tsx components/admin/AdminShell.test.tsx
git commit -m "feat(admin): AdminShell with tab row, bottom bar and phone banner"
```

---

### Task 6: Admin layout gate and storefront chrome opt-out

**Files:**
- Create: `app/admin/layout.tsx`
- Modify: `components/ConditionalLayout.tsx:26-33`
- Test: `app/admin/layout.test.tsx`
- Modify: `components/ConditionalLayout.test.tsx`

**Interfaces:**
- Consumes: `AdminShell` (Task 5), `isAdmin` / `isSuperAdmin` (Task 4).
- Produces: every `/admin/*` request is gated once in the layout; `redirect("/login?redirect=/admin")` when signed out, `redirect("/")` for non-admins. Page-level gates stay.

- [ ] **Step 1: Write the failing tests**

```tsx
// app/admin/layout.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown, shellProps: null as unknown }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("@/components/admin/AdminShell", () => ({
  default: (props: Record<string, unknown>) => {
    h.shellProps = props;
    return null;
  },
}));

import AdminLayout from "./layout";

beforeEach(() => {
  h.user = null;
  h.shellProps = null;
});

describe("admin layout gate", () => {
  it("sends a guest to login", async () => {
    await expect(AdminLayout({ children: null })).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(AdminLayout({ children: null })).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders the shell for an admin with role, phone flag and initials", async () => {
    h.user = { id: "a", email: "asha@cozyberries.in", phone: "", app_metadata: { role: "admin" }, user_metadata: { full_name: "Asha" } };
    await AdminLayout({ children: null });
    expect(h.shellProps).toMatchObject({ role: "admin", hasPhone: false, userId: "a", initials: "A" });
  });
  it("passes super_admin through and hasPhone true when a phone is set", async () => {
    h.user = { id: "s", email: "s@x.in", phone: "919876543210", app_metadata: { role: "super_admin" }, user_metadata: {} };
    await AdminLayout({ children: null });
    expect(h.shellProps).toMatchObject({ role: "super_admin", hasPhone: true, initials: "S" });
  });
});
```

Add to `components/ConditionalLayout.test.tsx`:

```tsx
  it("renders every admin page without the site header or bottom nav", () => {
    renderAt("/admin/orders");
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/admin/layout.test.tsx components/ConditionalLayout.test.tsx`
Expected: layout test FAIL (module not found); ConditionalLayout new case FAIL (header rendered).

- [ ] **Step 3: Implement the layout**

```tsx
// app/admin/layout.tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");
  const typed = user as unknown as SupabaseUser;
  if (!isAdmin(typed)) redirect("/"); // Non-admins should not learn this section exists.

  const name = (typed.user_metadata?.full_name as string | undefined) || typed.email || "";
  const initials = name.trim().charAt(0).toUpperCase() || "A";

  return (
    <AdminShell
      role={isSuperAdmin(typed) ? "super_admin" : "admin"}
      hasPhone={Boolean(typed.phone)}
      userId={typed.id}
      initials={initials}
    >
      {children}
    </AdminShell>
  );
}
```

In `components/ConditionalLayout.tsx`, replace the condition block:

```tsx
  // Sign-in/sign-up, the stall display and every admin page are standalone:
  // /admin/* carries its own AdminShell (top bar, tab row, bottom bar), and
  // /admin/print/* renders a fixed-size @page for label printing.
  if (
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup") ||
    pathname?.startsWith("/display") ||
    pathname?.startsWith("/admin")
  ) {
    return <>{children}</>;
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/admin components/ConditionalLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx app/admin/layout.test.tsx components/ConditionalLayout.tsx components/ConditionalLayout.test.tsx
git commit -m "feat(admin): server-gated admin layout with AdminShell; storefront chrome off under /admin"
```

---
### Task 7: Dashboard action counts — API, cache and `/admin` home

**Files:**
- Create: `lib/admin/dashboard-actions.ts`
- Create: `app/api/admin/dashboard/actions/route.ts`
- Create: `app/admin/page.tsx`
- Create: `app/admin/dashboard-client.tsx`
- Modify: `app/api/admin/orders/[id]/route.ts:135-141`
- Modify: `app/api/admin/pickup-orders/[id]/route.ts:65-75`
- Modify: `app/api/admin/orders/[id]/shipment/route.ts` (after a successful create or cancel)
- Test: `lib/admin/dashboard-actions.test.ts`
- Test: `app/api/admin/dashboard/actions/route.test.ts`
- Test: `app/admin/dashboard-client.test.tsx`

**Interfaces:**
- Produces:
  - `DASHBOARD_ACTIONS_KEY = "admin:dashboard:actions"`, `DASHBOARD_ACTIONS_TTL = 60`.
  - `DashboardActions = { awaiting: number; to_ship: number; ready_for_pickup: number; collected_today: number; generated_at: string }`.
  - `countDashboardActions(admin: SupabaseClient, now: Date): Promise<DashboardActions>`.
  - `clearDashboardActions(): Promise<void>` — deletes the Redis key, never throws.
  - `GET /api/admin/dashboard/actions` → `{ actions: DashboardActions; cached: boolean }`.

- [ ] **Step 1: Write the failing unit test for the counting helper**

```ts
// lib/admin/dashboard-actions.test.ts
import { describe, expect, it, vi } from "vitest";
import { countDashboardActions } from "./dashboard-actions";

/** A minimal PostgREST-style builder that records the filters applied. */
function fakeAdmin(counts: Record<string, number>, collectedRows: { order_id: string }[]) {
  const calls: Record<string, unknown>[] = [];
  const builder = (table: string) => {
    const filters: Record<string, unknown> = { table };
    const b: Record<string, unknown> = {};
    const chain = (k: string) => (...args: unknown[]) => {
      filters[k] = args;
      return b;
    };
    for (const k of ["eq", "in", "is", "gte", "not"]) b[k] = chain(k);
    b.select = (cols: string, opts?: { head?: boolean; count?: string }) => {
      filters.select = cols;
      filters.head = opts?.head ?? false;
      return b;
    };
    b.then = (resolve: (v: unknown) => void) => {
      calls.push(filters);
      if (table === "order_status_events") return resolve({ data: collectedRows, error: null });
      const key = JSON.stringify(filters.in ?? filters.eq);
      return resolve({ count: counts[key] ?? 0, error: null });
    };
    return b;
  };
  return { from: builder, calls };
}

describe("countDashboardActions", () => {
  it("counts each tile and de-duplicates collected events per order", async () => {
    const admin = fakeAdmin(
      {
        [JSON.stringify(["status", ["payment_pending", "verifying_payment"]])]: 3,
        [JSON.stringify(["status", ["payment_confirmed", "processing"]])]: 5,
        [JSON.stringify(["status", "ready_for_pickup"])]: 2,
      },
      [{ order_id: "o1" }, { order_id: "o1" }, { order_id: "o2" }],
    );
    const now = new Date("2026-09-30T06:00:00Z"); // 11:30 IST
    const r = await countDashboardActions(admin as never, now);
    expect(r).toMatchObject({ awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 2 });
    expect(r.generated_at).toBe(now.toISOString());
    const events = admin.calls.find((c) => c.table === "order_status_events")!;
    expect(events.eq).toEqual(["to_status", "collected"]);
    expect(events.gte).toEqual(["created_at", "2026-09-29T18:30:00.000Z"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/admin/dashboard-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// lib/admin/dashboard-actions.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { UpstashService } from "@/lib/upstash";
import { startOfIstDay } from "@/lib/orders/pickup";

export const DASHBOARD_ACTIONS_KEY = "admin:dashboard:actions";
export const DASHBOARD_ACTIONS_TTL = 60;

export interface DashboardActions {
  awaiting: number;
  to_ship: number;
  ready_for_pickup: number;
  collected_today: number;
  generated_at: string;
}

async function countRows(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Live counts for the dashboard tiles. Service-role client, read-only. */
export async function countDashboardActions(admin: SupabaseClient, now: Date): Promise<DashboardActions> {
  const head = { count: "exact" as const, head: true };
  const [awaiting, toShip, ready, collectedEvents] = await Promise.all([
    countRows(admin.from("orders").select("id", head).in("status", ["payment_pending", "verifying_payment"])),
    countRows(
      admin
        .from("orders")
        .select("id", head)
        .eq("fulfilment_method", "delivery")
        .in("status", ["payment_confirmed", "processing"])
        .is("tracking_number", null),
    ),
    countRows(admin.from("orders").select("id", head).eq("fulfilment_method", "pickup").eq("status", "ready_for_pickup")),
    admin
      .from("order_status_events")
      .select("order_id")
      .eq("to_status", "collected")
      .gte("created_at", startOfIstDay(now).toISOString()),
  ]);
  if (collectedEvents.error) throw new Error(collectedEvents.error.message);
  const collectedToday = new Set((collectedEvents.data ?? []).map((r: { order_id: string }) => r.order_id)).size;
  return {
    awaiting,
    to_ship: toShip,
    ready_for_pickup: ready,
    collected_today: collectedToday,
    generated_at: now.toISOString(),
  };
}

/** Called by every route that changes an order's status or tracking number. Never throws. */
export async function clearDashboardActions(): Promise<void> {
  try {
    await UpstashService.delete(DASHBOARD_ACTIONS_KEY);
  } catch (e) {
    console.error("[dashboard-actions] cache clear failed:", e);
  }
}
```

- [ ] **Step 4: Run the helper test**

Run: `npx vitest run lib/admin/dashboard-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

```ts
// app/api/admin/dashboard/actions/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  cache: new Map<string, unknown>(),
  count: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/upstash", () => ({
  UpstashService: {
    get: vi.fn(async (k: string) => h.cache.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => {
      h.cache.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      h.cache.delete(k);
    }),
  },
}));
vi.mock("@/lib/admin/dashboard-actions", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/dashboard-actions")>()),
  countDashboardActions: h.count,
}));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

beforeEach(() => {
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.cache.clear();
  h.count.mockReset().mockResolvedValue({ awaiting: 1, to_ship: 2, ready_for_pickup: 3, collected_today: 4, generated_at: "t" });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/dashboard/actions", () => {
  it("401s a guest before any service-role call", async () => {
    h.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET()).status).toBe(403);
  });
  it("counts, caches for 60 s, and serves the cached copy next time", async () => {
    const first = await (await GET()).json();
    expect(first).toEqual({ actions: expect.objectContaining({ awaiting: 1 }), cached: false });
    const second = await (await GET()).json();
    expect(second.cached).toBe(true);
    expect(h.count).toHaveBeenCalledTimes(1);
    const { UpstashService } = await import("@/lib/upstash");
    expect(UpstashService.set).toHaveBeenCalledWith("admin:dashboard:actions", expect.any(Object), 60);
  });
});
```

- [ ] **Step 6: Implement the route**

```ts
// app/api/admin/dashboard/actions/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import {
  countDashboardActions,
  DASHBOARD_ACTIONS_KEY,
  DASHBOARD_ACTIONS_TTL,
  type DashboardActions,
} from "@/lib/admin/dashboard-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  try {
    const cached = (await UpstashService.get(DASHBOARD_ACTIONS_KEY)) as DashboardActions | null;
    if (cached) return NextResponse.json({ actions: cached, cached: true });

    const admin = createAdminSupabaseClient();
    const actions = await countDashboardActions(admin, new Date());
    await UpstashService.set(DASHBOARD_ACTIONS_KEY, actions, DASHBOARD_ACTIONS_TTL);
    return NextResponse.json({ actions, cached: false });
  } catch (e) {
    console.error("[dashboard-actions]", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
```

- [ ] **Step 7: Run the route test**

Run: `npx vitest run app/api/admin/dashboard`
Expected: PASS.

- [ ] **Step 8: Invalidate on status and tracking changes**

In `app/api/admin/orders/[id]/route.ts`, add the import and call `clearDashboardActions()` beside the existing cache clears:

```ts
import { clearDashboardActions } from "@/lib/admin/dashboard-actions";
// ...
  const userId = current.user_id as string;
  Promise.all([
    CacheService.clearAllOrders(userId),
    CacheService.clearOrderDetails(userId, id),
    clearDashboardActions(),
  ]).catch((e) => console.error("[admin-orders] cache clear failed:", e));
```

In `app/api/admin/pickup-orders/[id]/route.ts`, after the `order_status_events` insert and before `return NextResponse.json({ order: updated[0] })`:

```ts
    await clearDashboardActions();
```

with the same import. In `app/api/admin/orders/[id]/shipment/route.ts`, call `await clearDashboardActions();` right before the success `NextResponse.json` of both `POST` and `DELETE`.

Add to each of the three existing route tests (`route.test.ts` next to them) a `vi.mock("@/lib/admin/dashboard-actions", () => ({ clearDashboardActions: vi.fn(async () => {}) }))` and, in the success case of each, `expect(clearDashboardActions).toHaveBeenCalled()` (import it via `import { clearDashboardActions } from "@/lib/admin/dashboard-actions"`).

Run: `npx vitest run app/api/admin/orders app/api/admin/pickup-orders`
Expected: PASS.

- [ ] **Step 9: Write the failing dashboard page test**

```tsx
// app/admin/dashboard-client.test.tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardClient from "./dashboard-client";

function renderWithQuery() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DashboardClient />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("DashboardClient", () => {
  it("shows the four action tiles with links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ actions: { awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 6, generated_at: "t" }, cached: false }), { status: 200 })),
    );
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveTextContent("3"));
    expect(screen.getByRole("link", { name: /Awaiting/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=awaiting");
    expect(screen.getByRole("link", { name: /To ship/ })).toHaveAttribute("href", "/admin/orders?fulfilment=delivery&status=processing");
    expect(screen.getByRole("link", { name: /Ready for pickup/ })).toHaveAttribute("href", "/admin/pickup-orders?tab=ready");
    expect(screen.getByRole("link", { name: /Collected today/ })).toHaveTextContent("6");
  });

  it("shows the error banner with retry when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    renderWithQuery();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Implement the page and client**

```tsx
// app/admin/page.tsx
import type { Metadata } from "next";
import DashboardClient from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  return <DashboardClient />;
}
```

```tsx
// app/admin/dashboard-client.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatGrid, StatTile, LoadingList, ErrorBanner } from "@/components/admin/kit";
import type { DashboardActions } from "@/lib/admin/dashboard-actions";

async function fetchActions(): Promise<{ actions: DashboardActions; cached: boolean }> {
  const res = await fetch("/api/admin/dashboard/actions", { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Failed to load dashboard"), { status: res.status });
  return body;
}

export default function DashboardClient() {
  const query = useQuery({
    queryKey: ["admin", "dashboard", "actions"],
    queryFn: fetchActions,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const a = query.data?.actions;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="What needs doing right now" />
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin" : undefined}
        />
      )}
      {query.isPending ? (
        <LoadingList rows={2} label="Loading dashboard" />
      ) : a ? (
        <StatGrid>
          <StatTile label="Awaiting ✅" value={a.awaiting} tone="attention" href="/admin/pickup-orders?tab=awaiting" />
          <StatTile label="To ship" value={a.to_ship} tone="attention" href="/admin/orders?fulfilment=delivery&status=processing" />
          <StatTile label="Ready for pickup" value={a.ready_for_pickup} href="/admin/pickup-orders?tab=ready" />
          <StatTile label="Collected today" value={a.collected_today} href="/admin/pickup-orders?tab=collected" />
        </StatGrid>
      ) : null}
    </div>
  );
}
```

The `?tab=` and `?status=`/`?fulfilment=` query strings are honoured by the reworked pages in Tasks 10 and 11 (they read `window.location.search` on mount).

- [ ] **Step 11: Run the tests**

Run: `npx vitest run app/admin/dashboard-client.test.tsx`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add lib/admin app/api/admin/dashboard app/admin/page.tsx app/admin/dashboard-client.tsx app/admin/dashboard-client.test.tsx app/api/admin/orders app/api/admin/pickup-orders
git commit -m "feat(admin): dashboard action counts with 60s Redis cache and /admin home"
```

---

### Task 8: `/admin/impersonate` page (user picker moves out of the modal)

**Files:**
- Create: `app/admin/impersonate/page.tsx`
- Create: `app/admin/impersonate/impersonate-client.tsx` (moved from `components/admin/UserPickerModal.tsx`)
- Test: `app/admin/impersonate/page.test.tsx`
- Test: `app/admin/impersonate/impersonate-client.test.tsx`

**Interfaces:**
- Consumes: `useAuth().refreshImpersonation`, `GET /api/admin/users/search?q=`, `POST /api/admin/users/send-otp`, `POST /api/admin/users/create`, `POST /api/admin/impersonation/start` (all unchanged).
- Produces: `ImpersonateClient()` default export, no props. Starting impersonation still ends with `window.location.href = "/"`.

- [ ] **Step 1: Write the failing page-gate test**

```tsx
// app/admin/impersonate/page.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("./impersonate-client", () => ({ default: () => null }));

import ImpersonatePage from "./page";

beforeEach(() => {
  h.user = null;
});

describe("impersonate page guard", () => {
  it("sends a guest to login and back here", async () => {
    await expect(ImpersonatePage()).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin\/impersonate$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(ImpersonatePage()).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders for an admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    await expect(ImpersonatePage()).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing client test**

```tsx
// app/admin/impersonate/impersonate-client.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ refreshImpersonation: vi.fn(async () => {}) }),
}));

import ImpersonateClient from "./impersonate-client";

afterEach(() => vi.restoreAllMocks());

describe("ImpersonateClient", () => {
  it("renders inline with both tabs and searches after two characters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ users: [{ id: "u1", email: "p@x.in", phone: "9876543210", full_name: "Priya", created_at: "2026-01-01" }] }), { status: 200 })),
    );
    render(<ImpersonateClient />);
    expect(screen.getByRole("heading", { level: 1, name: "Impersonate user" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Find user" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create new user" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name (min 2 chars)"), { target: { value: "pr" } });
    await waitFor(() => expect(screen.getByText("Priya")).toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/admin/users/search?");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run app/admin/impersonate`
Expected: FAIL — modules not found.

- [ ] **Step 4: Move the modal into the page**

```bash
git mv components/admin/UserPickerModal.tsx app/admin/impersonate/impersonate-client.tsx
```

Then edit `app/admin/impersonate/impersonate-client.tsx`:

1. Delete the `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription` import and add `import { PageHeader } from "@/components/admin/kit";`.
2. Delete the `UserPickerModalProps` interface (lines 23-26). Change the signature to `export default function ImpersonateClient() {` and remove the `open, onOpenChange` destructuring.
3. Delete the effect that resets when `!open` (the `useEffect(() => { if (!open) { ... resetAll(); } }, [open, resetAll]);` block). Keep `resetAll` — it is still used after a successful create.
4. In the focus effect, remove `if (!open) return;` and change its deps to `[activeTab]`.
5. In the search effect, change `if (!open || activeTab !== "search") return;` to `if (activeTab !== "search") return;` and drop `open` from its deps.
6. In the start handler, delete the `onOpenChange(false);` line and change its deps to `[refreshImpersonation]`.
7. Replace the JSX wrapper. From `<Dialog open={open} onOpenChange={onOpenChange}>` down to and including `</DialogHeader>` becomes:

```tsx
    <div>
      <PageHeader
        title="Impersonate user"
        subtitle="Find an existing user or create a new one, then continue in their session."
      />
      <div className="rounded-2xl border border-cb-border bg-cb-white p-4">
```

and the closing `</DialogContent>\n    </Dialog>` becomes `</div>\n    </div>`.

8. Change `<TabsList className="grid w-full grid-cols-2">` to `<TabsList className="grid w-full grid-cols-2 rounded-xl bg-cb-linen">` (visual only).

Run `grep -n "open\b\|onOpenChange\|Dialog" app/admin/impersonate/impersonate-client.tsx` — it must print nothing.

- [ ] **Step 5: Create the page**

```tsx
// app/admin/impersonate/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import ImpersonateClient from "./impersonate-client";

export const metadata: Metadata = { title: "Impersonate user — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImpersonatePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/impersonate");
  if (!isAdmin(user as unknown as SupabaseUser)) redirect("/");
  return <ImpersonateClient />;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/admin/impersonate`
Expected: PASS. (`app/profile/page.tsx` and `HamburgerSheet.tsx` still import the old path; `npm run lint` will fail until Task 9, which is expected.)

- [ ] **Step 7: Commit**

```bash
git add app/admin/impersonate components/admin
git commit -m "feat(admin): /admin/impersonate page hosts the user picker"
```

---

### Task 9: One "Admin" entry in the storefront; impersonation exit lands in admin

**Files:**
- Modify: `components/header.tsx` (icon row, before the profile link)
- Modify: `app/profile/page.tsx:5-11,15-17,161-190,207`
- Modify: `components/HamburgerSheet.tsx:20,52,279-321` and the `UserPickerModal` render near the bottom
- Modify: `components/impersonation-banner.tsx:50`
- Test: `components/header.test.tsx` (add a case)
- Test: `app/profile/page.test.tsx` (new)
- Test: `components/HamburgerSheet.test.tsx` (new)
- Test: `components/impersonation-banner.test.tsx` (new)

**Interfaces:**
- Consumes: `useAuth().isAdmin`.
- Produces: header icon `aria-label="Open admin"` → `/admin`; profile row "Open admin" → `/admin`; hamburger item "Admin" → `/admin`. Exit impersonation navigates to `/admin/on-behalf-orders`.

- [ ] **Step 1: Write the failing tests**

Add to `components/header.test.tsx` (the file already hoists `h.user` and mocks `useAuth` as `() => ({ user: h.user })`; change that mock to `() => ({ user: h.user, isAdmin: h.isAdmin ?? false })` and add `isAdmin: false` to the hoisted object):

```tsx
  it("shows one Admin entry only to admins", () => {
    h.user = { id: "a", email: "a@x.in" };
    h.isAdmin = true;
    render(<Header />);
    expect(screen.getByRole("link", { name: "Open admin" })).toHaveAttribute("href", "/admin");
  });
  it("hides the Admin entry from customers", () => {
    h.user = { id: "c", email: "c@x.in" };
    h.isAdmin = false;
    render(<Header />);
    expect(screen.queryByRole("link", { name: "Open admin" })).not.toBeInTheDocument();
  });
```

```tsx
// app/profile/page.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "u", email: "u@x.in" }, isAdmin: h.isAdmin, signOut: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { full_name: "Asha", phone: null }, isLoading: false }) }));
vi.mock("@/components/AccountMenuList", () => ({ default: () => null }));
vi.mock("@/components/profile/PhoneLinkRow", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ProfilePage from "./page";

describe("profile page admin entry", () => {
  it("shows one Open admin row to admins", () => {
    h.isAdmin = true;
    render(<ProfilePage />);
    expect(screen.getByRole("link", { name: /Open admin/ })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Impersonate user")).not.toBeInTheDocument();
    expect(screen.queryByText("Stall refills")).not.toBeInTheDocument();
  });
  it("shows nothing admin-related to customers", () => {
    h.isAdmin = false;
    render(<ProfilePage />);
    expect(screen.queryByRole("link", { name: /Open admin/ })).not.toBeInTheDocument();
  });
});
```

If `ProfilePage` imports other hooks that hit the network (`useNotifications`, `useRouter`), mock them the same way; the test must render without a QueryClient.

```tsx
// components/HamburgerSheet.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "u", email: "u@x.in" }, loading: false, signOut: vi.fn(), isAdmin: h.isAdmin }),
}));
vi.mock("@/hooks/useCatalog", () => ({ useCatalog: () => ({ data: null }) }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => (props: Record<string, unknown>) => {
    const { children, whileHover, whileTap, variants, initial, animate, exit, ...rest } = props as Record<string, unknown> & { children?: React.ReactNode };
    const Tag = tag as keyof JSX.IntrinsicElements;
    return <Tag {...(rest as object)}>{children}</Tag>;
  } }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { HamburgerSheet } from "./HamburgerSheet";

describe("HamburgerSheet admin entry", () => {
  it("shows one Admin item to admins and none of the old links", () => {
    h.isAdmin = true;
    render(<HamburgerSheet />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(screen.getByRole("link", { name: /^Admin$/ })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Stall pickups")).not.toBeInTheDocument();
    expect(screen.queryByText("On-behalf orders")).not.toBeInTheDocument();
  });
});
```

Adjust the mocks to whatever hooks `HamburgerSheet.tsx` actually imports (check its import list); the assertion set is what matters. If the trigger button has a different accessible name, use `screen.getAllByRole("button")[0]`.

```tsx
// components/impersonation-banner.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const stop = vi.fn(async () => {});
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({
    impersonation: { active: true, target: { full_name: "Priya", email: "p@x.in" } },
    stopImpersonation: stop,
  }),
}));

import { ImpersonationBanner } from "./impersonation-banner";

describe("ImpersonationBanner exit", () => {
  it("stops impersonating and returns to the on-behalf list", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });
    render(<ImpersonationBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("/admin/on-behalf-orders");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/header.test.tsx app/profile/page.test.tsx components/HamburgerSheet.test.tsx components/impersonation-banner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Header**

In `components/header.tsx`: add `ShieldCheck` to the lucide import, change `const { user } = useAuth();` to `const { user, isAdmin } = useAuth();`, and insert before `<Link href="/profile">`:

```tsx
            {hydrated && isAdmin && (
              <Link href="/admin" aria-label="Open admin">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 lg:h-7 lg:w-7 rounded-full hover:bg-transparent"
                  tabIndex={-1}
                >
                  <ShieldCheck className="!w-5 !h-5 text-cb-fg" />
                </Button>
              </Link>
            )}
```

- [ ] **Step 4: Profile page**

In `app/profile/page.tsx`:
- Imports: replace `UserPlus, ClipboardList, Store, PackagePlus` with `ShieldCheck`; delete `import UserPickerModal from "@/components/admin/UserPickerModal";`; add `import PhoneLinkRow from "@/components/profile/PhoneLinkRow";` (created in Task 17; until then add a stub file exporting `export default function PhoneLinkRow() { return null; }` so the build passes, and Task 17 replaces it).
- Delete `const [pickerOpen, setPickerOpen] = React.useState(false);`.
- Replace the whole `{isAdmin && ( <div className="mt-6 space-y-2"> ... </div> )}` block with:

```tsx
      <PhoneLinkRow />

      {isAdmin && (
        <Link
          href="/admin"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-cb-border bg-cb-white px-4 py-4 text-cb-fg"
        >
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[15px] font-semibold">Open admin</span>
          <ChevronRight className="h-4 w-4 text-cb-muted-fg shrink-0" />
        </Link>
      )}
```

- Delete `{isAdmin && <UserPickerModal open={pickerOpen} onOpenChange={setPickerOpen} />}`.

- [ ] **Step 5: Hamburger sheet**

In `components/HamburgerSheet.tsx`: delete the `UserPickerModal` import and its `pickerOpen` state and render; replace the admin `motion.div` block (the five `MenuItem`s) with:

```tsx
              {isAdmin && (
                <motion.div className="mt-6 pt-4 border-t border-gray-200" variants={itemVariants}>
                  <MenuItem href="/admin">
                    <div className="flex items-center">
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Admin
                    </div>
                  </MenuItem>
                </motion.div>
              )}
```

Update the lucide import (add `ShieldCheck`, drop `UserPlus`, `ListOrdered`, `ClipboardList`, `Store`, `PackagePlus` if nothing else uses them; `npm run lint` reports unused imports).

- [ ] **Step 6: Impersonation banner**

In `components/impersonation-banner.tsx`, replace `window.location.reload();` with `window.location.assign("/admin/on-behalf-orders");` and update the comment: a full navigation (not `router.push`) so every client cache refetches under the admin's own session, landing on the list where the just-placed order appears.

- [ ] **Step 7: Run the tests and lint**

Run: `npx vitest run components app/profile && npm run lint`
Expected: PASS, lint clean (no references to `UserPickerModal` remain: `grep -rn UserPickerModal app components lib` prints nothing).

- [ ] **Step 8: Commit**

```bash
git add components/header.tsx components/header.test.tsx app/profile/page.tsx app/profile/page.test.tsx components/HamburgerSheet.tsx components/HamburgerSheet.test.tsx components/impersonation-banner.tsx components/impersonation-banner.test.tsx components/profile/PhoneLinkRow.tsx
git commit -m "feat(admin): single Admin entry in header, profile and hamburger; exit impersonation to on-behalf list"
```

---
### Task 10: Orders page rework

**Files:**
- Modify: `app/admin/orders/orders-client.tsx` (rewrite)
- Modify: `app/admin/orders/order-detail-dialog.tsx` (rewrite on `ActionSheet`)
- Modify: `app/admin/orders/notifications-panel.tsx` (rewrite as a collapsible section)
- Modify: `app/admin/orders/page.tsx` (drop the wrapper div; the shell provides the container)
- Modify: `app/admin/orders/orders-client.test.tsx`, `app/admin/orders/order-detail-dialog.test.tsx` (selectors)

**Interfaces:**
- Consumes: kit (`PageHeader`, `FilterChips`, `ListCard`, `ActionSheet`, `EmptyState`, `LoadingList`, `ErrorBanner`, `StatusPill`), `./api` unchanged.
- Produces: URL query on mount: `?status=<OrderStatus>`, `?fulfilment=delivery|pickup`, `?days=7|30|90|all` seed the filters. Labels kept: "Status", "Tracking number", "Delivery notes", "Save", "Create Delhivery shipment", "Print label", "Cancel shipment", "Bill PDF", search placeholder "Search order #, AWB, name, phone". Filter groups have `aria-label`s "Status filter", "Fulfilment filter", "Date range".

- [ ] **Step 1: Update the tests first**

In `app/admin/orders/orders-client.test.tsx`: wherever the test selected the `<select>` by `getByLabelText("Status filter")` and fired `change`, select the chip instead: `fireEvent.click(within(screen.getByRole("radiogroup", { name: "Status filter" })).getByRole("radio", { name: "Processing" }))`. Same for the fulfilment select (`"Fulfilment filter"`, chips "All", "Delivery", "Pickup") and the day buttons (`"Date range"`, chips "7d", "30d", "90d", "All"). Add one new case:

```tsx
  it("seeds the filters from the URL on mount", async () => {
    window.history.replaceState({}, "", "/admin/orders?fulfilment=delivery&status=processing&days=30");
    renderClient();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls[0][0]).toContain("status=processing"));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("fulfilment=delivery");
    expect(within(screen.getByRole("radiogroup", { name: "Date range" })).getByRole("radio", { name: "30d" })).toHaveAttribute("aria-checked", "true");
    window.history.replaceState({}, "", "/admin/orders");
  });
```

In `app/admin/orders/order-detail-dialog.test.tsx`: the order title is now the sheet's accessible name: `screen.getByRole("dialog", { name: /#ORD/ })`. Every other selector (`getByLabelText(/Tracking number/i)`, `getByLabelText(/Delivery notes/i)`, `getByRole("button", { name: "Save" })`, the id-keyed resync case) stays.

Run: `npx vitest run app/admin/orders`
Expected: FAIL on the new selectors.

- [ ] **Step 2: Rewrite `orders-client.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatOrderStatus } from "@/lib/utils/order-status";
import {
  PageHeader, FilterChips, ListCard, EmptyState, LoadingList, ErrorBanner, type FilterChip,
} from "@/components/admin/kit";
import {
  api, ApiError, listUrl, matchesSearch, PAGE_SIZE,
  type AdminOrdersListResponse, type OrderFilters,
} from "./api";
import OrderDetailDialog from "./order-detail-dialog";
import NotificationsPanel from "./notifications-panel";

const STATUSES = ["payment_pending", "verifying_payment", "payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded"] as const;
const STATUS_CHIPS: FilterChip<string>[] = [{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: formatOrderStatus(s) }))];
const FULFILMENT_CHIPS: FilterChip<string>[] = [
  { value: "all", label: "All" }, { value: "delivery", label: "Delivery" }, { value: "pickup", label: "Pickup" },
];
const DAY_CHIPS: FilterChip<string>[] = [
  { value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "all", label: "All" },
];
const DEFAULT_FILTERS: OrderFilters = { status: "all", fulfilment: "all", days: 7, offset: 0 };

/** Seeds from ?status=&fulfilment=&days= so dashboard tiles can deep-link. Read in an effect: no useSearchParams. */
function filtersFromLocation(): OrderFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const status = p.get("status");
  const fulfilment = p.get("fulfilment");
  const days = p.get("days");
  return {
    status: status && (STATUSES as readonly string[]).includes(status) ? status : "all",
    fulfilment: fulfilment === "delivery" || fulfilment === "pickup" ? fulfilment : "all",
    days: days === "all" ? null : days && ["7", "30", "90"].includes(days) ? Number(days) : 7,
    offset: 0,
  };
}

export default function OrdersClient() {
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS);
  const [seeded, setSeeded] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setFilters(filtersFromLocation());
    setSeeded(true);
  }, []);

  const { data, isPending, error, refetch, isFetching } = useQuery<AdminOrdersListResponse, ApiError>({
    queryKey: ["admin", "orders", filters],
    queryFn: () => api<AdminOrdersListResponse>(listUrl(filters)),
    enabled: seeded,
    staleTime: 30_000,
    // Defense in depth alongside the id-keyed resync in OrderDetailDialog: a
    // window-focus refetch here would hand the open sheet a new order object
    // for the same row, which must never wipe an admin's in-progress edit.
    refetchOnWindowFocus: false,
  });

  const orders = (data?.orders ?? []).filter((o) => matchesSearch(o, search));
  const total = data?.total ?? 0;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  const set = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  const authError = error && (error.status === 401 || error.status === 403);

  return (
    <div className="space-y-3">
      <PageHeader title="Orders" subtitle={`${total} in range`} />
      <NotificationsPanel />

      <FilterChips label="Status filter" chips={STATUS_CHIPS} value={filters.status} onChange={(v) => set({ status: v })} />
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips label="Fulfilment filter" chips={FULFILMENT_CHIPS} value={filters.fulfilment} onChange={(v) => set({ fulfilment: v })} />
        <FilterChips
          label="Date range"
          chips={DAY_CHIPS}
          value={filters.days === null ? "all" : String(filters.days)}
          onChange={(v) => set({ days: v === "all" ? null : Number(v) })}
        />
      </div>

      <Input
        placeholder="Search order #, AWB, name, phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-xl bg-cb-white"
      />

      {error && (
        <ErrorBanner
          message={error.message}
          onRetry={() => void refetch()}
          retrying={isFetching}
          loginRedirect={authError ? "/admin/orders" : undefined}
        />
      )}
      {isPending && seeded && <LoadingList label="Loading orders" />}

      {!isPending && orders.length === 0 && !error && (
        <EmptyState title="No orders match" hint="Try a wider date range or clear the search." />
      )}

      <ul className="space-y-3">
        {orders.map((o) => (
          <ListCard
            key={o.id}
            testId={`order-${o.id}`}
            title={`#${o.order_number || o.id.slice(0, 8)}`}
            status={o.status}
            meta={`${o.shipping_address?.full_name || "—"} · ${o.items.length} item${o.items.length === 1 ? "" : "s"} · ₹${o.total_amount ?? 0}`}
            onClick={() => setSelectedId(o.id)}
          >
            <p className="flex justify-between text-xs text-cb-muted-fg">
              <span>{o.fulfilment_method === "pickup" ? "Stall pickup" : "Delivery"}</span>
              {o.tracking_number && <span>{o.carrier_name || "AWB"}: {o.tracking_number}</span>}
            </p>
          </ListCard>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" className="rounded-full" disabled={filters.offset === 0}
            onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE_SIZE) }))}>
            Previous
          </Button>
          <span className="text-cb-muted-fg">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button size="sm" variant="outline" className="rounded-full" disabled={filters.offset + PAGE_SIZE >= total}
            onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE_SIZE }))}>
            Next
          </Button>
        </div>
      )}

      <OrderDetailDialog order={selected} onClose={() => setSelectedId(null)} onChanged={refresh} />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `order-detail-dialog.tsx`**

Keep the file name (tests import it). Replace the imports of `Dialog*` with `import { ActionSheet } from "@/components/admin/kit";` and replace the JSX from `return (` to the end with:

```tsx
  return (
    <ActionSheet open onOpenChange={(open) => !open && onClose()} title={`#${order.order_number || order.id.slice(0, 8)}`}>
      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-cb-fg">{order.shipping_address?.full_name || "—"}</p>
          <p className="text-cb-muted-fg">
            {order.shipping_address?.phone || order.customer_phone || ""} · ₹{order.total_amount ?? 0}
          </p>
          <ul className="mt-1 text-cb-muted-fg">
            {order.items.map((it, i) => (
              <li key={it.id ?? i}>{it.sku || "item"}{it.size ? ` · ${it.size}` : ""} × {it.quantity ?? 1}</li>
            ))}
          </ul>
        </div>

        <label className="block">
          <span className="text-xs text-cb-muted-fg">Status</span>
          <select
            className="mt-1 h-10 w-full rounded-xl border border-cb-border bg-cb-white px-2"
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
          <span className="text-xs text-cb-muted-fg">Tracking number</span>
          <Input className="rounded-xl" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-cb-muted-fg">Delivery notes</span>
          <Input className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button className="rounded-full" disabled={busy || !hasChanges} onClick={() => save.mutate(changedFields)}>
            Save
          </Button>
          {canCreateShipment && (
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => createShipment.mutate()}>
              Create Delhivery shipment
            </Button>
          )}
          {isDelhivery && (
            <>
              <Button variant="outline" className="rounded-full"
                onClick={() => window.open(`/admin/print/label/${order.order_number || order.id}?autoPrint=true`, "_blank")}>
                Print label
              </Button>
              <Button variant="destructive" className="rounded-full" disabled={busy} onClick={() => cancelShipment.mutate()}>
                Cancel shipment
              </Button>
            </>
          )}
          {order.bill_url && (
            <Button variant="outline" className="rounded-full" onClick={() => window.open(order.bill_url!, "_blank")}>
              Bill PDF
            </Button>
          )}
        </div>

        {isDelhivery && <TrackingPanel order={order} />}
      </div>
    </ActionSheet>
  );
```

Everything above `return (` (state, the id-keyed `useEffect`, the three mutations, `changedFields`) is unchanged.

- [ ] **Step 4: Rewrite `notifications-panel.tsx` as a collapsible section**

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
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

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;
  return (
    <section className="rounded-2xl border border-cb-border bg-cb-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-cb-fg"
      >
        <span>
          Delhivery scans
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-cb-terracotta px-1.5 text-xs text-white">{unread}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="max-h-72 space-y-1 overflow-y-auto border-t border-cb-border p-2">
          {notifications.length === 0 && <li className="p-2 text-xs text-cb-muted-fg">No shipment notifications.</li>}
          {notifications.map((n) => (
            <li key={n.id} className={`rounded-xl p-2 text-xs ${n.read ? "opacity-60" : "bg-cb-linen"}`}>
              <p className="font-medium">{n.title}</p>
              <p className="text-cb-muted-fg">{n.message}</p>
              {!n.read && (
                <button className="mt-1 underline" onClick={() => markRead.mutate(n.id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Page wrapper**

In `app/admin/orders/page.tsx`, replace the returned `<div className="container mx-auto px-4 py-6 max-w-3xl"><OrdersClient /></div>` with `<OrdersClient />`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/admin/orders`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin/orders
git commit -m "feat(admin): orders page on the kit — chips, list cards, action sheet, collapsible scans"
```

---

### Task 11: Pickups page rework

**Files:**
- Modify: `app/admin/pickup-orders/pickup-orders-client.tsx` (rewrite)
- Modify: `app/admin/pickup-orders/page.tsx` (drop wrapper, use `PageHeader`)
- Modify: `app/admin/pickup-orders/pickup-orders-client.test.tsx`

**Interfaces:**
- Consumes: kit; `/api/admin/pickup-orders?tab=&q=` and `PATCH /api/admin/pickup-orders/[id]` unchanged.
- Produces: `?tab=awaiting|handover|ready|collected` on mount selects the tab. Tab labels: "Awaiting ✅", "To hand over", "Ready", "Collected today". Button labels kept: "Mark ready", "Mark collected", "Send ready message", "Send bill". Search placeholder kept.

- [ ] **Step 1: Update the test**

In `pickup-orders-client.test.tsx` the tabs were `role="tab"` buttons already, so `getByRole("tab", { name: /Awaiting/ })` keeps working. Add:

```tsx
  it("opens the tab named in the URL", async () => {
    window.history.replaceState({}, "", "/admin/pickup-orders?tab=ready");
    renderClient();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain("/api/admin/pickup-orders?tab=ready"));
    window.history.replaceState({}, "", "/admin/pickup-orders");
  });
```

Run: `npx vitest run app/admin/pickup-orders`
Expected: the new case FAILS (first call is `tab=handover`).

- [ ] **Step 2: Rewrite the client**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, PackageCheck, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STALL } from "@/lib/config/business";
import { whatsappLink } from "@/lib/utils/whatsapp";
import { SegmentedTabs, ListCard, EmptyState, LoadingList, type SegmentedTab } from "@/components/admin/kit";
import {
  parsePickupTab, PICKUP_TAB_STATUSES, type PickupAction, type PickupOrderRow, type PickupTab,
} from "@/lib/orders/pickup";

const TAB_LABELS: Record<PickupTab, string> = {
  awaiting: "Awaiting ✅",
  handover: "To hand over",
  ready: "Ready",
  collected: "Collected today",
};
const TAB_ORDER: PickupTab[] = ["awaiting", "handover", "ready", "collected"];

const PAYMENT_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash" };
/** A payment staff or the customer recorded that the owner has not confirmed yet. */
const CLAIM_LABEL: Record<string, string> = { upi: "UPI claimed", cash: "Cash recorded" };

function tabFromLocation(): PickupTab {
  if (typeof window === "undefined") return "handover";
  return parsePickupTab(new URLSearchParams(window.location.search).get("tab")) ?? "handover";
}

export default function PickupOrdersClient() {
  const [tab, setTab] = useState<PickupTab>(tabFromLocation);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<PickupOrderRow[]>([]);
  const [awaitingCount, setAwaitingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/pickup-orders?${params}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load pickup orders");
      setOrders(body.orders ?? []);
      setAwaitingCount(typeof body.awaiting_count === "number" ? body.awaiting_count : null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pickup orders");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const readyLink = (order: PickupOrderRow) =>
    whatsappLink(
      order.customer_phone,
      `Hi${order.customer_name ? ` ${order.customer_name}` : ""}! Your CozyBerries order ${order.order_number} is ready to collect at ${STALL.name}, ${STALL.addressLines.join(", ")}. Hours: ${STALL.hours}.`
    );

  const act = async (order: PickupOrderRow, action: PickupAction) => {
    setBusyId(order.id);
    try {
      const res = await fetch(`/api/admin/pickup-orders/${order.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Update failed");
      if (action === "ready") {
        const link = readyLink(order);
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }
      toast.success(action === "ready" ? "Marked ready" : "Marked collected");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const billLink = (order: PickupOrderRow) =>
    order.bill_url
      ? whatsappLink(
          order.customer_phone,
          `Your CozyBerries bill for order ${order.order_number}${order.invoice_number ? ` (invoice ${order.invoice_number})` : ""}. Download the PDF: ${order.bill_url}`
        )
      : null;

  const tabs: SegmentedTab<PickupTab>[] = TAB_ORDER.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === "awaiting" && awaitingCount ? awaitingCount : undefined,
  }));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cb-muted-fg" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by phone or order number"
          className="rounded-xl bg-cb-white pl-9"
        />
      </div>

      {!query && <SegmentedTabs label="Pickup queue" tabs={tabs} value={tab} onChange={setTab} />}

      {loading ? (
        <LoadingList label="Loading pickup orders" />
      ) : orders.length === 0 ? (
        <EmptyState title="No pickup orders here" />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const paidWith = order.payments.find((p) => p.status === "completed")?.payment_method;
            const awaitingConfirmation = PICKUP_TAB_STATUSES.awaiting.includes(order.status);
            const claimedWith = awaitingConfirmation
              ? order.payments.find((p) => p.status === "pending" || p.status === "processing")?.payment_method
              : undefined;
            const bill = billLink(order);
            const ready = readyLink(order);
            const busy = busyId === order.id;
            const canReady = order.status === "processing" || order.status === "payment_confirmed";
            const canCollect = canReady || order.status === "ready_for_pickup";
            return (
              <ListCard
                key={order.id}
                testId={`pickup-${order.id}`}
                title={order.customer_name ?? "Customer"}
                status={order.status}
                meta={`${order.customer_phone ? `+91 ${order.customer_phone}` : "no phone"} · ${order.order_number}`}
                actions={
                  canReady || canCollect || (order.status === "ready_for_pickup" && ready) || bill ? (
                    <>
                      {canReady && (
                        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => act(order, "ready")}>
                          <Store className="mr-1.5 h-4 w-4" aria-hidden />
                          Mark ready
                        </Button>
                      )}
                      {canCollect && (
                        <Button className="rounded-full" disabled={busy} onClick={() => act(order, "collected")}>
                          <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
                          Mark collected
                        </Button>
                      )}
                      {order.status === "ready_for_pickup" && ready && (
                        <Button variant="outline" className="rounded-full" asChild>
                          <a href={ready} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />
                            Send ready message
                          </a>
                        </Button>
                      )}
                      {bill && (
                        <Button variant="outline" className="rounded-full" asChild>
                          <a href={bill} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />
                            Send bill
                          </a>
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              >
                <ul>
                  {order.order_items.map((item, idx) => (
                    <li key={`${item.name}-${idx}`}>
                      {item.quantity} × {item.name}
                      {item.size ? ` · ${item.size}` : ""}
                      {item.color ? ` · ${item.color}` : ""}
                      {` — ₹${Number(item.price) * item.quantity}`}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-cb-muted-fg">
                  ₹{Number(order.total_amount).toFixed(0)}
                  {paidWith ? ` · ${PAYMENT_LABEL[paidWith] ?? paidWith}` : ""}
                  {claimedWith ? ` · ${CLAIM_LABEL[claimedWith] ?? claimedWith}` : ""}
                  {order.invoice_number ? ` · ${order.invoice_number}` : ""}
                </p>
                {awaitingConfirmation && (
                  <p className="mt-2 font-medium text-amber-800">{"Waiting for the owner's ✅ on Telegram"}</p>
                )}
              </ListCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Page wrapper**

In `app/admin/pickup-orders/page.tsx`, keep the gate; replace the returned markup with:

```tsx
  return (
    <div>
      <PageHeader title="Stall pickups" subtitle="Hand over, mark ready, send the bill." />
      <PickupOrdersClient />
    </div>
  );
```

with `import { PageHeader } from "@/components/admin/kit";`. Delete any `<h1>` / intro paragraph the page rendered before.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/admin/pickup-orders`
Expected: PASS (existing cases and the URL tab case).

- [ ] **Step 5: Commit**

```bash
git add app/admin/pickup-orders
git commit -m "feat(admin): pickups page on the kit — segmented tabs, list cards, ?tab= deep link"
```

---
### Task 12: Refills page rework

**Files:**
- Modify: `app/admin/stall-refills/stall-refills-client.tsx` (rewrite presentation; keep query, mutations, error rules)
- Modify: `app/admin/stall-refills/page.tsx` (use `PageHeader`)
- Modify: `app/admin/stall-refills/stall-refills-client.test.tsx`

**Interfaces:**
- Consumes: kit; `lib/orders/stall-refills` (`actionLabel`, `formatSaleDay`, `updatedAgo`, types) unchanged; `/api/admin/stall-refills` unchanged.
- Produces: Today / Yesterday as `SegmentedTabs` (label "Day"); only the chosen day's `<section aria-label="Today"|"Yesterday">` is rendered, heading text `Today · Sun 27 Sep` kept; `data-testid="refill-line-<key>"`, buttons "Refilled", "No stock left", "Undo", "Set to 0", "Cancel", "Refresh", link "Log in again" all kept.

- [ ] **Step 1: Update the test**

In `stall-refills-client.test.tsx`, every assertion about Yesterday (the `getByRole("region", { name: "Yesterday" })` and `getByRole("heading", { name: "Yesterday · Sat 26 Sep" })` cases) now first clicks the tab: `fireEvent.click(screen.getByRole("tab", { name: "Yesterday" }))`. The Today assertions are unchanged. The "Couldn't refresh, retrying" `role="status"` assertion becomes `screen.getByRole("alert")` with the same text. Add:

```tsx
  it("shows the day tabs with the open count on each", async () => {
    // fixture: today has 2 lines open + 1 done, yesterday 1 open
    renderClient();
    await screen.findByRole("tab", { name: /Today/ });
    expect(screen.getByRole("tab", { name: /Today/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Yesterday/ })).toHaveTextContent("1");
    expect(screen.queryByRole("region", { name: "Yesterday" })).not.toBeInTheDocument();
  });
```

Run: `npx vitest run app/admin/stall-refills`
Expected: FAIL (no tabs).

- [ ] **Step 2: Rewrite the client**

Keep lines 1-121 of the current file (imports, `ApiError`, `api`, `isAuthError`, `TickInput`, `useNow`, `leftClass`, the query, both mutations, `record`) with these import changes: remove `Button` usage for Refresh/Try again only where replaced below (keep `Button` import), remove the `AlertDialog*` import, and add:

```tsx
import { SegmentedTabs, ListCard, EmptyState, LoadingList, ErrorBanner, ActionSheet } from "@/components/admin/kit";
```

Add state next to `confirming`: `const [day, setDay] = useState<"today" | "yesterday">("today");`

Replace everything from `if (query.isPending) {` to the end of the file with:

```tsx
  if (query.isPending) return <LoadingList label="Loading" />;
  if (!query.data) {
    return (
      <ErrorBanner
        message={query.error?.message ?? "Failed to load refills"}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        loginRedirect={isAuthError(query.error) ? "/admin/stall-refills" : undefined}
      />
    );
  }

  const data = query.data;
  const openCount = (d: RefillDay) => d.lines.filter((l) => l.pending > 0).length;
  const current = day === "today" ? data.today : data.yesterday;
  const title = day === "today" ? "Today" : "Yesterday";
  const emptyText = day === "today" ? "Nothing sold yet today." : "Nothing sold yesterday.";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm text-cb-muted-fg">
        <span>{updatedAgo(now - query.dataUpdatedAt)}</span>
        <Button size="sm" variant="ghost" aria-label="Refresh" disabled={query.isFetching} onClick={() => query.refetch()}>
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {query.isError && isAuthError(query.error) ? (
        <ErrorBanner message="Signed out. Log in again to see refills." loginRedirect="/admin/stall-refills" />
      ) : (
        query.isError && <ErrorBanner message="Couldn't refresh, retrying" />
      )}

      <div className="mb-4">
        <SegmentedTabs
          label="Day"
          tabs={[
            { key: "today", label: "Today", count: openCount(data.today) },
            { key: "yesterday", label: "Yesterday", count: openCount(data.yesterday) },
          ]}
          value={day}
          onChange={setDay}
        />
      </div>

      <DaySection
        title={title}
        day={current}
        emptyText={emptyText}
        busy={busy}
        onRecord={record}
        onConfirmNoStock={(date, line) => setConfirming({ date, line })}
        onUndo={(id) => undo.mutate(id)}
      />

      <ActionSheet
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? `Set ${confirming.line.name}${confirming.line.size ? ` ${confirming.line.size}` : ""} to 0?` : ""}
        description="It will show as out of stock on the website."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full sm:flex-1" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            className="rounded-full sm:flex-1"
            onClick={() => {
              if (confirming) record(confirming.date, confirming.line, "no_stock");
              setConfirming(null);
            }}
          >
            Set to 0
          </Button>
        </div>
      </ActionSheet>
    </div>
  );
}

interface SectionProps {
  title: string;
  day: RefillDay;
  emptyText: string;
  busy: boolean;
  onRecord: (date: string, line: RefillLine, action: RefillAction) => void;
  onConfirmNoStock: (date: string, line: RefillLine) => void;
  onUndo: (id: string) => void;
}

function DaySection({ title, day, emptyText, busy, onRecord, onConfirmNoStock, onUndo }: SectionProps) {
  const open = day.lines.filter((line) => line.pending > 0).length;
  const done = day.lines.length - open;
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-cb-fg">
          {title} · {formatSaleDay(day.date)}
        </h2>
        {day.lines.length > 0 && (
          <p className="text-sm text-cb-muted-fg">
            {open} to refill · {done} done
          </p>
        )}
      </div>
      {day.lines.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <ul className="space-y-3">
          {day.lines.map((line) => (
            <LineItem
              key={line.key}
              line={line}
              busy={busy}
              onRecord={(action) => onRecord(day.date, line, action)}
              onConfirmNoStock={() => onConfirmNoStock(day.date, line)}
              onUndo={onUndo}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface LineProps {
  line: RefillLine;
  busy: boolean;
  onRecord: (action: RefillAction) => void;
  onConfirmNoStock: () => void;
  onUndo: (id: string) => void;
}

function LineItem({ line, busy, onRecord, onConfirmNoStock, onUndo }: LineProps) {
  const handled = line.pending === 0;
  const unlinked = line.variant_slug === null;
  return (
    <ListCard
      testId={`refill-line-${line.key}`}
      dimmed={handled}
      title={
        <span className="flex gap-3">
          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
            {line.image && (
              <Image src={line.image} alt={line.name} width={48} height={48} unoptimized className="h-12 w-12 object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold leading-snug text-cb-fg">{line.name}</span>
            <span className="block text-sm font-normal text-cb-muted-fg">
              {line.size ?? "No size"} · Sold {line.sold}
              {line.stock_now !== null && (
                <>
                  {" · "}
                  <span className={leftClass(line.stock_now)}>Left {line.stock_now}</span>
                </>
              )}
            </span>
          </span>
        </span>
      }
      actions={
        !unlinked && !handled ? (
          <>
            <Button className="rounded-full" disabled={busy} onClick={() => onRecord("refilled")}>
              <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
              Refilled
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={onConfirmNoStock}>
              <PackageX className="mr-1.5 h-4 w-4" aria-hidden />
              No stock left
            </Button>
          </>
        ) : undefined
      }
    >
      {unlinked ? (
        <p className="text-amber-800">Not linked to a stock item</p>
      ) : (
        <>
          {!handled && line.actions.length > 0 && <p className="font-medium">{line.pending} more to refill</p>}
          {line.actions.length > 0 && (
            <ul className="mt-1 space-y-1 text-cb-muted-fg">
              {line.actions.map((action) => (
                <li key={action.id} className="flex items-center justify-between gap-2">
                  <span>{actionLabel(action)}</span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUndo(action.id)}>
                    <Undo2 className="mr-1 h-4 w-4" aria-hidden />
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ListCard>
  );
}
```

Drop the now-unused `Loader2` import. The existing test asserts the image by `getByRole("img", { name })`; the `Image` mock in that test still applies.

- [ ] **Step 3: Page**

In `app/admin/stall-refills/page.tsx`, replace the returned markup with:

```tsx
  return (
    <div>
      <PageHeader title="Stall refills" subtitle="What sold today and yesterday. Put it back on the shelf, then tick it off." />
      <StallRefillsClient />
    </div>
  );
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/admin/stall-refills lib/orders/stall-refills.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/stall-refills
git commit -m "feat(admin): refills page on the kit — day tabs, list cards, confirm sheet"
```

---

### Task 13: On-behalf orders rework

**Files:**
- Modify: `app/admin/on-behalf-orders/on-behalf-orders-client.tsx` (rewrite)
- Modify: `app/admin/on-behalf-orders/page.tsx` (use `PageHeader`)
- Test: `app/admin/on-behalf-orders/on-behalf-orders-client.test.tsx` (new)

**Interfaces:**
- Consumes: `useOnBehalfOrders(offset, limit)` and `ON_BEHALF_ORDERS_PAGE_SIZE` from `hooks/useApiQueries` unchanged; kit.
- Produces: table at `lg` and up (`hidden lg:block`), `ListCard`s below; tapping a card opens an `ActionSheet` with customer, placed-by, date, total.

- [ ] **Step 1: Write the failing test**

```tsx
// app/admin/on-behalf-orders/on-behalf-orders-client.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/useApiQueries", () => ({
  ON_BEHALF_ORDERS_PAGE_SIZE: 25,
  useOnBehalfOrders: () => h.state,
}));

import OnBehalfOrdersClient from "./on-behalf-orders-client";

const order = {
  id: "o1",
  order_number: "ORD-1",
  status: "processing",
  total_amount: 1240,
  currency: "INR",
  created_at: "2026-09-30T05:00:00Z",
  customer: { email: "p@x.in", full_name: "Priya" },
  placed_by_admin: { email: "asha@cozyberries.in", full_name: "Asha" },
};

describe("OnBehalfOrdersClient", () => {
  it("renders list cards and opens the detail sheet", () => {
    h.state = { data: { orders: [order], total: 1 }, isPending: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    fireEvent.click(screen.getByRole("button", { name: /#ORD-1/ }));
    const sheet = screen.getByRole("dialog", { name: "#ORD-1" });
    expect(sheet).toHaveTextContent("Priya");
    expect(sheet).toHaveTextContent("Asha");
  });
  it("shows the empty state pointing at Impersonate", () => {
    h.state = { data: { orders: [], total: 0 }, isPending: false, isFetching: false, error: null, refetch: vi.fn() };
    render(<OnBehalfOrdersClient />);
    expect(screen.getByText("No orders placed on behalf yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impersonate a user" })).toHaveAttribute("href", "/admin/impersonate");
  });
  it("shows the error banner with retry", () => {
    const refetch = vi.fn();
    h.state = { data: undefined, isPending: false, isFetching: false, error: new Error("nope"), refetch };
    render(<OnBehalfOrdersClient />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/admin/on-behalf-orders`
Expected: FAIL.

- [ ] **Step 3: Rewrite the client**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/utils";
import { StatusPill, ListCard, ActionSheet, EmptyState, LoadingList, ErrorBanner } from "@/components/admin/kit";
import { useOnBehalfOrders, ON_BEHALF_ORDERS_PAGE_SIZE } from "@/hooks/useApiQueries";

type Row = NonNullable<ReturnType<typeof useOnBehalfOrders>["data"]>["orders"][number];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Person({ email, full_name }: { email?: string | null; full_name?: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="text-sm text-cb-fg">{email ?? "—"}</span>
      {full_name && <span className="text-xs text-cb-muted-fg">{full_name}</span>}
    </span>
  );
}

export default function OnBehalfOrdersClient() {
  // Offset lives in component state so TanStack Query caches each page by key.
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const query = useOnBehalfOrders(offset, ON_BEHALF_ORDERS_PAGE_SIZE);
  const orders = query.data?.orders ?? [];
  const total = query.data?.total ?? 0;
  const isRefetching = query.isFetching && !query.isPending;

  if (query.isPending) return <LoadingList label="Loading on-behalf orders" />;
  if (query.error) {
    return (
      <ErrorBanner
        message={query.error instanceof Error ? query.error.message : "Failed to load orders"}
        onRetry={() => void query.refetch()}
        retrying={isRefetching}
      />
    );
  }
  if (orders.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState title="No orders placed on behalf yet" hint="Impersonate a customer and place an order in their session." />
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/admin/impersonate">Impersonate a user</Link>
        </Button>
      </div>
    );
  }

  const canPrev = offset > 0;
  const canNext = offset + orders.length < total;

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-2xl border border-cb-border bg-cb-white lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Placed by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                <TableCell className="font-medium">#{o.order_number}</TableCell>
                <TableCell><Person {...o.customer} /></TableCell>
                <TableCell><Person {...(o.placed_by_admin ?? {})} /></TableCell>
                <TableCell className="text-sm">{formatDate(o.created_at)}</TableCell>
                <TableCell className="text-right text-sm">{formatPrice(o.total_amount, undefined, o.currency)}</TableCell>
                <TableCell><StatusPill status={o.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {orders.map((o) => (
          <ListCard
            key={o.id}
            testId={`on-behalf-${o.id}`}
            title={`#${o.order_number}`}
            status={o.status}
            meta={`${o.customer.full_name ?? o.customer.email ?? "—"} · ${formatDate(o.created_at)} · ${formatPrice(o.total_amount, undefined, o.currency)}`}
            onClick={() => setSelected(o)}
          />
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-cb-muted-fg">
          Showing {total === 0 ? 0 : offset + 1}–{offset + orders.length} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" disabled={!canPrev || isRefetching}
            onClick={() => setOffset((p) => Math.max(0, p - ON_BEHALF_ORDERS_PAGE_SIZE))}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Previous
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" disabled={!canNext || isRefetching}
            onClick={() => setOffset((p) => p + ON_BEHALF_ORDERS_PAGE_SIZE)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <ActionSheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} title={selected ? `#${selected.order_number}` : ""}>
        {selected && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-cb-muted-fg">Customer</dt>
            <dd><Person {...selected.customer} /></dd>
            <dt className="text-cb-muted-fg">Placed by</dt>
            <dd><Person {...(selected.placed_by_admin ?? {})} /></dd>
            <dt className="text-cb-muted-fg">Date</dt>
            <dd>{formatDate(selected.created_at)}</dd>
            <dt className="text-cb-muted-fg">Total</dt>
            <dd>{formatPrice(selected.total_amount, undefined, selected.currency)}</dd>
            <dt className="text-cb-muted-fg">Status</dt>
            <dd><StatusPill status={selected.status} /></dd>
          </dl>
        )}
      </ActionSheet>
    </div>
  );
}
```

If `Row`'s `customer` / `placed_by_admin` types in `lib/types/admin-on-behalf-orders.ts` use different field names, follow that file; the current client reads `order.customer.email`, `order.customer.full_name`, `order.placed_by_admin?.email`, `order.placed_by_admin?.full_name`, `order.currency`.

- [ ] **Step 4: Page**

In `app/admin/on-behalf-orders/page.tsx`, replace the returned markup with:

```tsx
  return (
    <div>
      <PageHeader title="On-behalf orders" subtitle="Orders placed by admins for customers. Read-only." />
      <OnBehalfOrdersClient />
    </div>
  );
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/admin/on-behalf-orders`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/on-behalf-orders
git commit -m "feat(admin): on-behalf orders on the kit — cards on phones, detail sheet"
```

---
### Task 14: Admins API — list, promote, demote (`super_admin` only)

**Files:**
- Create: `lib/admin/admin-accounts.ts`
- Create: `app/api/admin/admins/route.ts`
- Create: `app/api/admin/admins/[id]/route.ts`
- Test: `lib/admin/admin-accounts.test.ts`
- Test: `app/api/admin/admins/route.test.ts`
- Test: `app/api/admin/admins/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin()` (Task 4), `createAdminSupabaseClient()`.
- Produces:
  - `AdminAccount = { id: string; email: string | null; phone: string | null; full_name: string | null; role: "admin" | "super_admin"; created_at: string }`.
  - `listAdminAccounts(admin): Promise<AdminAccount[]>` — pages `auth.admin.listUsers` (1000 per page, max 20 pages), keeps admin roles, sorted `super_admin` first then by email.
  - `GET /api/admin/admins` → `{ admins: AdminAccount[] }`.
  - `POST /api/admin/admins` body `{ user_id }` → 400 missing, 404 unknown, 409 already admin/super_admin, 200 `{ admin: AdminAccount }`.
  - `DELETE /api/admin/admins/[id]` → 400 own id, 404 unknown, 409 target is `super_admin` or not an admin, 200 `{ ok: true }`.

- [ ] **Step 1: Write the failing helper test**

```ts
// lib/admin/admin-accounts.test.ts
import { describe, expect, it, vi } from "vitest";
import { listAdminAccounts, toAdminAccount } from "./admin-accounts";

const u = (id: string, role: string | undefined, email: string) => ({
  id, email, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: { full_name: email.split("@")[0] },
});

describe("listAdminAccounts", () => {
  it("pages through users and keeps only admin roles, super_admin first", async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: [u("1", "customer", "c@x.in"), u("2", "admin", "zed@x.in")] }, error: null })
      .mockResolvedValueOnce({ data: { users: [u("3", "super_admin", "owner@x.in")] }, error: null });
    const admin = { auth: { admin: { listUsers } } };
    const r = await listAdminAccounts(admin as never, 2);
    expect(r.map((a) => a.id)).toEqual(["3", "2"]);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});

describe("toAdminAccount", () => {
  it("maps the auth user shape", () => {
    expect(toAdminAccount(u("9", "admin", "a@x.in") as never)).toEqual({
      id: "9", email: "a@x.in", phone: null, full_name: "a", role: "admin", created_at: "2026-01-01T00:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/admin/admin-accounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
// lib/admin/admin-accounts.ts
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AdminRole = "admin" | "super_admin";
export interface AdminAccount {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: AdminRole;
  created_at: string;
}

export function roleOf(user: Pick<User, "app_metadata">): string | undefined {
  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  return typeof role === "string" ? role : undefined;
}

export function toAdminAccount(user: User): AdminAccount {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone || null,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: roleOf(user) === "super_admin" ? "super_admin" : "admin",
    created_at: user.created_at,
  };
}

const MAX_PAGES = 20;

/** Every account whose role is admin or super_admin. Reads only; caller has passed requireSuperAdmin(). */
export async function listAdminAccounts(admin: SupabaseClient, perPage = 1000): Promise<AdminAccount[]> {
  const out: AdminAccount[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      const role = roleOf(u);
      if (role === "admin" || role === "super_admin") out.push(toAdminAccount(u));
    }
    if (users.length < perPage) break;
  }
  return out.sort((a, b) => {
    if (a.role !== b.role) return a.role === "super_admin" ? -1 : 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });
}
```

- [ ] **Step 4: Run the helper test**

Run: `npx vitest run lib/admin/admin-accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

```ts
// app/api/admin/admins/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  users: new Map<string, Record<string, unknown>>(),
  updateUserById: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [...h.users.values()] }, error: null }),
        getUserById: async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }),
        updateUserById: h.updateUserById,
      },
    },
  })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const u = (id: string, role?: string) => ({
  id, email: `${id}@x.in`, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: {},
});
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/admins", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  h.user = { id: "s", app_metadata: { role: "super_admin" } };
  h.users.clear();
  h.users.set("s", u("s", "super_admin"));
  h.users.set("a", u("a", "admin"));
  h.users.set("c", u("c", "customer"));
  h.updateUserById.mockReset().mockImplementation(async (id: string, patch: { app_metadata: { role: string } }) => {
    const cur = h.users.get(id)!;
    h.users.set(id, { ...cur, app_metadata: patch.app_metadata });
    return { data: { user: h.users.get(id) }, error: null };
  });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/admins", () => {
  it("401s a guest and 403s a plain admin before any service-role call", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = { id: "a", app_metadata: { role: "admin" } };
    expect((await GET()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("lists admin accounts for a super_admin", async () => {
    const body = await (await GET()).json();
    expect(body.admins.map((a: { id: string }) => a.id)).toEqual(["s", "a"]);
  });
});

describe("POST /api/admin/admins", () => {
  it("400s without user_id", async () => {
    expect((await post({})).status).toBe(400);
  });
  it("404s an unknown user", async () => {
    expect((await post({ user_id: "zz" })).status).toBe(404);
  });
  it("409s an existing admin or super_admin", async () => {
    expect((await post({ user_id: "a" })).status).toBe(409);
    expect((await post({ user_id: "s" })).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("promotes a customer to admin, scoped to that id", async () => {
    const res = await post({ user_id: "c" });
    expect(res.status).toBe(200);
    expect(h.updateUserById).toHaveBeenCalledWith("c", { app_metadata: { role: "admin" } });
    expect((await res.json()).admin).toMatchObject({ id: "c", role: "admin" });
  });
});
```

```ts
// app/api/admin/admins/[id]/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  users: new Map<string, Record<string, unknown>>(),
  updateUserById: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }),
        updateUserById: h.updateUserById,
      },
    },
  })),
}));

import { NextRequest } from "next/server";
import { DELETE } from "./route";

const u = (id: string, role?: string) => ({
  id, email: `${id}@x.in`, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: {},
});
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/admins/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = { id: "s", app_metadata: { role: "super_admin" } };
  h.users.clear();
  h.users.set("s", u("s", "super_admin"));
  h.users.set("s2", u("s2", "super_admin"));
  h.users.set("a", u("a", "admin"));
  h.users.set("c", u("c", "customer"));
  h.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("DELETE /api/admin/admins/[id]", () => {
  it("403s a plain admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    expect((await del("c")).status).toBe(403);
  });
  it("400s removing yourself", async () => {
    expect((await del("s")).status).toBe(400);
  });
  it("404s an unknown id", async () => {
    expect((await del("zz")).status).toBe(404);
  });
  it("409s a super_admin target and a non-admin target", async () => {
    expect((await del("s2")).status).toBe(409);
    expect((await del("c")).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("demotes an admin to customer, scoped to that id", async () => {
    expect((await del("a")).status).toBe(200);
    expect(h.updateUserById).toHaveBeenCalledWith("a", { app_metadata: { role: "customer" } });
  });
});
```

- [ ] **Step 6: Implement the routes**

```ts
// app/api/admin/admins/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { listAdminAccounts, roleOf, toAdminAccount } from "@/lib/admin/admin-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;
  try {
    const admins = await listAdminAccounts(createAdminSupabaseClient());
    return NextResponse.json({ admins });
  } catch (e) {
    console.error("[admins] list failed:", e);
    return NextResponse.json({ error: "Failed to load admins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = roleOf(data.user);
  if (role === "admin" || role === "super_admin") {
    return NextResponse.json({ error: "Already an admin" }, { status: 409 });
  }

  // Scoped to the one id the super admin acted on; app_metadata is admin-write-only.
  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" },
  });
  if (updateError || !updated?.user) {
    console.error("[admins] promote failed:", updateError);
    return NextResponse.json({ error: "Failed to make admin" }, { status: 500 });
  }
  return NextResponse.json({ admin: toAdminAccount(updated.user) });
}
```

```ts
// app/api/admin/admins/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { roleOf } from "@/lib/admin/admin-accounts";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === gate.user.id) return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data?.user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = roleOf(data.user);
  if (role === "super_admin") return NextResponse.json({ error: "Super admins are managed in Supabase" }, { status: 409 });
  if (role !== "admin") return NextResponse.json({ error: "Not an admin" }, { status: 409 });

  const { error: updateError } = await admin.auth.admin.updateUserById(id, { app_metadata: { role: "customer" } });
  if (updateError) {
    console.error("[admins] demote failed:", updateError);
    return NextResponse.json({ error: "Failed to remove admin" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run app/api/admin/admins lib/admin`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/admin-accounts.ts lib/admin/admin-accounts.test.ts app/api/admin/admins
git commit -m "feat(admin): admins API — list, promote, demote behind requireSuperAdmin"
```

---

### Task 15: `/admin/admins` page

**Files:**
- Create: `app/admin/admins/page.tsx`
- Create: `app/admin/admins/admins-client.tsx`
- Test: `app/admin/admins/page.test.tsx`
- Test: `app/admin/admins/admins-client.test.tsx`

**Interfaces:**
- Consumes: Task 14 routes; `GET /api/admin/users/search?q=<text>&limit=10` → `{ users: { id, email, phone, full_name, created_at }[] }`; kit.
- Produces: page gate redirects non-super-admins to `/admin`. Buttons: "Add admin", "Make admin", "Remove admin", confirm "Remove"; search placeholder "Email, phone, or name".

- [ ] **Step 1: Write the failing page-gate test**

```tsx
// app/admin/admins/page.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("./admins-client", () => ({ default: () => null }));

import AdminsPage from "./page";

beforeEach(() => {
  h.user = null;
});

describe("admins page guard", () => {
  it("sends a guest to login", async () => {
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin\/admins$/);
  });
  it("sends a plain admin to the dashboard", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/admin$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders for a super_admin", async () => {
    h.user = { id: "s", app_metadata: { role: "super_admin" } };
    await expect(AdminsPage()).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing client test**

```tsx
// app/admin/admins/admins-client.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/supabase-auth-provider", () => ({ useAuth: () => ({ user: { id: "s" } }) }));

import AdminsClient from "./admins-client";

const admins = [
  { id: "s", email: "owner@x.in", phone: "9876543210", full_name: "Owner", role: "super_admin", created_at: "2026-01-01T00:00:00Z" },
  { id: "a", email: "asha@x.in", phone: null, full_name: "Asha", role: "admin", created_at: "2026-02-01T00:00:00Z" },
];

function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
      const handler = routes[key];
      if (!handler) return new Response(JSON.stringify({ error: `no route ${key}` }), { status: 500 });
      return new Response(JSON.stringify(handler(init)), { status: 200 });
    }),
  );
}

function renderClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminsClient />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AdminsClient", () => {
  it("lists admins; super_admin cards have no Remove button, the caller's card neither", async () => {
    mockFetch({ "GET /api/admin/admins": () => ({ admins }) });
    renderClient();
    await screen.findByText("asha@x.in");
    expect(screen.getByText("owner@x.in")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove admin" })).toHaveLength(1);
  });

  it("removes an admin after confirming", async () => {
    const del = vi.fn(() => ({ ok: true }));
    mockFetch({ "GET /api/admin/admins": () => ({ admins }), "DELETE /api/admin/admins/a": del });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Remove admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it("searches and promotes a user", async () => {
    const post = vi.fn(() => ({ admin: { id: "u9", email: "new@x.in", phone: null, full_name: "New", role: "admin", created_at: "t" } }));
    mockFetch({
      "GET /api/admin/admins": () => ({ admins }),
      "GET /api/admin/users/search": () => ({ users: [{ id: "u9", email: "new@x.in", phone: null, full_name: "New", created_at: "t" }] }),
      "POST /api/admin/admins": post,
    });
    renderClient();
    fireEvent.click(await screen.findByRole("button", { name: "Add admin" }));
    fireEvent.change(screen.getByPlaceholderText("Email, phone, or name"), { target: { value: "new" } });
    fireEvent.click(await screen.findByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(JSON.parse(String(post.mock.calls[0][0]?.body))).toEqual({ user_id: "u9" });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run app/admin/admins`
Expected: FAIL.

- [ ] **Step 4: Implement the page**

```tsx
// app/admin/admins/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";
import { PageHeader } from "@/components/admin/kit";
import AdminsClient from "./admins-client";

export const metadata: Metadata = { title: "Admins — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin/admins");
  const typed = user as unknown as SupabaseUser;
  if (!isAdmin(typed)) redirect("/");
  if (!isSuperAdmin(typed)) redirect("/admin");

  return (
    <div>
      <PageHeader title="Admins" subtitle="Who can open this section. Super admins are managed in Supabase." />
      <AdminsClient />
    </div>
  );
}
```

- [ ] **Step 5: Implement the client**

```tsx
// app/admin/admins/admins-client.tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/supabase-auth-provider";
import { ListCard, ActionSheet, EmptyState, LoadingList, ErrorBanner } from "@/components/admin/kit";
import type { AdminAccount } from "@/lib/admin/admin-accounts";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error || "Request failed", res.status);
  return body as T;
}

type SearchUser = { id: string; email: string | null; phone: string | null; full_name: string | null };
const KEY = ["admin", "admins"] as const;

export default function AdminsClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminAccount | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);

  const list = useQuery<{ admins: AdminAccount[] }, ApiError>({ queryKey: KEY, queryFn: () => api("/api/admin/admins") });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Request failed");

  const promote = useMutation({
    mutationFn: (userId: string) =>
      api<{ admin: AdminAccount }>("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: (d) => {
      toast.success(`${d.admin.email ?? "User"} is now an admin. They will see Admin after signing in again.`);
      setAdding(false);
      setQ("");
      setResults([]);
      invalidate();
    },
    onError,
  });
  const demote = useMutation({
    mutationFn: (id: string) => api(`/api/admin/admins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Admin removed");
      setRemoving(null);
      invalidate();
    },
    onError,
  });

  useEffect(() => {
    if (!adding || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const body = await api<{ users: SearchUser[] }>(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}&limit=10`, { signal: ctrl.signal });
        setResults(body.users);
      } catch (e) {
        if ((e as Error).name !== "AbortError") onError(e);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [adding, q]);

  const admins = list.data?.admins ?? [];
  const adminIds = new Set(admins.map((a) => a.id));
  const authError = list.error && (list.error.status === 401 || list.error.status === 403);

  return (
    <div className="space-y-3">
      <Button className="w-full rounded-full" onClick={() => setAdding(true)}>
        <UserPlus className="mr-2 h-4 w-4" aria-hidden />
        Add admin
      </Button>

      {list.isError && (
        <ErrorBanner message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching}
          loginRedirect={authError ? "/admin/admins" : undefined} />
      )}
      {list.isPending && <LoadingList label="Loading admins" />}
      {!list.isPending && admins.length === 0 && !list.isError && <EmptyState title="No admins yet" />}

      <ul className="space-y-3">
        {admins.map((a) => (
          <ListCard
            key={a.id}
            testId={`admin-${a.id}`}
            title={
              <span className="flex items-center gap-2">
                {a.full_name ?? a.email ?? a.id}
                {a.role === "super_admin" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cb-linen px-2 py-0.5 text-xs font-semibold text-cb-fg">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    Super admin
                  </span>
                )}
              </span>
            }
            meta={`${a.email ?? "no email"} · ${a.phone ? `+91 ${a.phone.slice(-10)}` : "no phone"} · since ${new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`}
            actions={
              a.role === "admin" && a.id !== user?.id ? (
                <Button variant="outline" className="rounded-full" onClick={() => setRemoving(a)}>
                  Remove admin
                </Button>
              ) : undefined
            }
          />
        ))}
      </ul>

      <ActionSheet open={adding} onOpenChange={setAdding} title="Add admin" description="Find the person by email, phone or name.">
        <Input autoFocus placeholder="Email, phone, or name" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-xl" />
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <ListCard
              key={u.id}
              title={u.full_name ?? u.email ?? u.id}
              meta={`${u.email ?? "no email"} · ${u.phone ? `+91 ${u.phone.slice(-10)}` : "no phone"}`}
              actions={
                adminIds.has(u.id) ? (
                  <span className="text-center text-sm text-cb-muted-fg">Already an admin</span>
                ) : (
                  <Button className="rounded-full" disabled={promote.isPending} onClick={() => promote.mutate(u.id)}>
                    Make admin
                  </Button>
                )
              }
            />
          ))}
        </ul>
        {q.trim().length >= 2 && results.length === 0 && <p className="mt-3 text-sm text-cb-muted-fg">No matches.</p>}
      </ActionSheet>

      <ActionSheet open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${removing.full_name ?? removing.email ?? "this admin"}?` : ""}
        description="They keep their account and orders, and lose access to this section at once.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full sm:flex-1" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" className="rounded-full sm:flex-1" disabled={demote.isPending}
            onClick={() => removing && demote.mutate(removing.id)}>
            Remove
          </Button>
        </div>
      </ActionSheet>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/admin/admins`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin/admins
git commit -m "feat(admin): /admin/admins page — list, add and remove admins (super_admin)"
```

---
### Task 16: Phone linking — `link` intent on the VerifyNow send and verify routes

**Files:**
- Modify: `app/api/auth/verifynow/send/route.ts:13-14,40-45,59-68`
- Modify: `app/api/auth/verifynow/verify/route.ts:22,101-106,139-233`
- Test: `app/api/auth/verifynow/send/route.test.ts` (new)
- Test: `app/api/auth/verifynow/verify/route.test.ts` (new)

**Interfaces:**
- Consumes: `findUserIdByPhone(phone) → { userId, email } | null`, `sendOtp`, `validateOtp`, `UpstashService.checkRateLimit`, `createServerSupabaseClient().auth.getUser()`, `createAdminSupabaseClient().auth.admin.updateUserById`.
- Produces: intent `"link"` on both routes. Send: 401 without a session, 409 `"This number is already on another account"`, else `{ verificationId, timeout }`. Verify: 401 without a session, 409 as above, on success `updateUserById(user.id, { phone, phone_confirm: true })` and `{ ok: true, phone }` (no magic link).

- [ ] **Step 1: Write the failing send-route test**

```ts
// app/api/auth/verifynow/send/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  existing: null as null | { userId: string; email: string },
  sendOtp: vi.fn(),
  allowed: true,
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("@/lib/auth-phone", () => ({ findUserIdByPhone: vi.fn(async () => h.existing) }));
vi.mock("@/lib/verifynow", () => ({
  getAuthTokenFromEnv: () => "tok",
  sendOtp: h.sendOtp,
  getVerifyNowUserMessage: (m: string) => ({ status: 502, error: m }),
}));
vi.mock("@/lib/upstash", () => ({
  UpstashService: { checkRateLimit: vi.fn(async () => ({ allowed: h.allowed })) },
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/verifynow/send", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  h.user = null;
  h.existing = null;
  h.allowed = true;
  h.sendOtp.mockReset().mockResolvedValue({ verificationId: "v1" });
});

describe("POST /api/auth/verifynow/send", () => {
  it("still rejects unknown intents", async () => {
    expect((await post({ phone: "9876543210", intent: "nope" })).status).toBe(400);
  });
  it("login: 404s a number with no account", async () => {
    expect((await post({ phone: "9876543210", intent: "login" })).status).toBe(404);
  });
  it("link: 401s without a session", async () => {
    expect((await post({ phone: "9876543210", intent: "link" })).status).toBe(401);
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
  it("link: 409s a number already on another account", async () => {
    h.user = { id: "me" };
    h.existing = { userId: "other", email: "o@x.in" };
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This number is already on another account");
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
  it("link: sends the OTP for a free number, or one already on this account", async () => {
    h.user = { id: "me" };
    expect((await post({ phone: "9876543210", intent: "link" })).status).toBe(200);
    h.existing = { userId: "me", email: "me@x.in" };
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(await res.json()).toEqual({ verificationId: "v1", timeout: 60 });
  });
});
```

- [ ] **Step 2: Write the failing verify-route test**

```ts
// app/api/auth/verifynow/verify/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  existing: null as null | { userId: string; email: string },
  validateOtp: vi.fn(),
  updateUserById: vi.fn(),
  generateLink: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { updateUserById: h.updateUserById, generateLink: h.generateLink, getUserById: vi.fn() } },
  })),
}));
vi.mock("@/lib/auth-phone", () => ({
  findUserIdByPhone: vi.fn(async () => h.existing),
  findAuthUserByEmail: vi.fn(),
  createPhoneUser: vi.fn(),
}));
vi.mock("@/lib/verifynow", () => ({
  getAuthTokenFromEnv: () => "tok",
  validateOtp: h.validateOtp,
  getVerifyNowUserMessage: (m: string) => ({ status: 400, error: m }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/verifynow/verify", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const link = { verificationId: "v1", code: "1234", intent: "link", phone: "9876543210" };

beforeEach(() => {
  h.user = null;
  h.existing = null;
  h.validateOtp.mockReset().mockResolvedValue(undefined);
  h.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
  h.generateLink.mockReset();
});

describe("POST /api/auth/verifynow/verify (link)", () => {
  it("401s without a session before validating the code", async () => {
    expect((await post(link)).status).toBe(401);
    expect(h.validateOtp).not.toHaveBeenCalled();
  });
  it("400s a wrong code", async () => {
    h.user = { id: "me" };
    h.validateOtp.mockRejectedValue(new Error("Invalid OTP"));
    expect((await post(link)).status).toBe(400);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("409s a number on another account even after a valid code", async () => {
    h.user = { id: "me" };
    h.existing = { userId: "other", email: "o@x.in" };
    expect((await post(link)).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("sets the phone on the caller only and returns no redirect", async () => {
    h.user = { id: "me" };
    const res = await post(link);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phone: "9876543210" });
    expect(h.updateUserById).toHaveBeenCalledWith("me", { phone: "9876543210", phone_confirm: true });
    expect(h.generateLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run app/api/auth/verifynow`
Expected: FAIL — `link` is rejected as an unknown intent.

- [ ] **Step 4: Change the send route**

In `app/api/auth/verifynow/send/route.ts`:

```ts
const INTENTS = ["register", "login", "link"] as const;
const NO_ACCOUNT_MESSAGE = "No account with this number. Please register first.";
const NUMBER_IN_USE_MESSAGE = "This number is already on another account";
```

Add `import { createServerSupabaseClient } from "@/lib/supabase-server";`. Change the intent error text to `"intent must be register, login or link"`. Insert directly after the intent check and before the rate limit:

```ts
    // link: attach a verified phone to the signed-in account (Google-created admins have none).
    let linkUserId: string | null = null;
    if (intent === "link") {
      const session = await createServerSupabaseClient();
      const {
        data: { user },
      } = await session.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      linkUserId = user.id;
    }
```

Replace the `if (intent === "login") { ... }` block with:

```ts
    if (intent === "login" || intent === "link") {
      const existing = await findUserIdByPhone(normalizedPhone);
      if (intent === "login" && !existing) {
        return NextResponse.json({ error: NO_ACCOUNT_MESSAGE }, { status: 404 });
      }
      if (intent === "link" && existing && existing.userId !== linkUserId) {
        return NextResponse.json({ error: NUMBER_IN_USE_MESSAGE }, { status: 409 });
      }
    }
```

- [ ] **Step 5: Change the verify route**

In `app/api/auth/verifynow/verify/route.ts`: `const INTENTS = ["register", "login", "link"] as const;`, the error text `"intent must be register, login or link"`, and add `createServerSupabaseClient` to the `@/lib/supabase-server` import. Insert before the `try { const authToken = getAuthTokenFromEnv(); ... validateOtp` block:

```ts
  // link: the caller must be signed in; the code is only validated after that so a
  // guest cannot burn someone's OTP attempts.
  let linkUserId: string | null = null;
  if (intent === "link") {
    const session = await createServerSupabaseClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    linkUserId = user.id;
  }
```

Insert at the top of the second `try {` (before `let email: string;`):

```ts
    if (intent === "link" && linkUserId) {
      const existing = await findUserIdByPhone(normalizedPhone);
      if (existing && existing.userId !== linkUserId) {
        return NextResponse.json({ error: "This number is already on another account" }, { status: 409 });
      }
      const adminSupabase = createAdminSupabaseClient();
      const { error: linkError } = await adminSupabase.auth.admin.updateUserById(linkUserId, {
        phone: normalizedPhone,
        phone_confirm: true,
      });
      if (linkError) throw new Error(`Failed to link phone: ${linkError.message}`);
      return NextResponse.json({ ok: true, phone: normalizedPhone });
    }
```

Update the doc comment at the top of the file: add "6. Link: signed-in user attaches a verified phone; no magic link is issued."

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/api/auth/verifynow app/api/admin/users`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth/verifynow
git commit -m "feat(auth): link intent attaches a verified phone to the signed-in account"
```

---

### Task 17: `PhoneLinkRow` on the profile page

**Files:**
- Create: `components/profile/PhoneLinkRow.tsx` (replaces the Task 9 stub)
- Test: `components/profile/PhoneLinkRow.test.tsx`

**Interfaces:**
- Consumes: `useAuth().user`, `useAuth().refreshProfile`, `useProfile(user)` (`profile.phone`), `IndianPhoneInput` (`value: string` digits, `onChange(digits)`), `POST /api/auth/verifynow/send` and `/verify` with `intent: "link"` (Task 16).
- Produces: a row with `id="phone"` (anchor target of `/profile#phone`). States: number shown + "Change"; "Add phone"; entry form (Send OTP); code form (Verify). On success calls `refreshProfile()` and toasts "Phone added".

- [ ] **Step 1: Write the failing test**

```tsx
// components/profile/PhoneLinkRow.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ phone: null as string | null, refreshProfile: vi.fn(async () => {}) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/supabase-auth-provider", () => ({
  useAuth: () => ({ user: { id: "me" }, refreshProfile: h.refreshProfile }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { phone: h.phone }, isLoading: false }) }));

import PhoneLinkRow from "./PhoneLinkRow";

beforeEach(() => {
  h.phone = null;
  h.refreshProfile.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("PhoneLinkRow", () => {
  it("shows the current number with Change", () => {
    h.phone = "9876543210";
    render(<PhoneLinkRow />);
    expect(screen.getByText(/98765 43210/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });

  it("sends an OTP with the link intent, then verifies and refreshes the profile", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        if (url.endsWith("/send")) return new Response(JSON.stringify({ verificationId: "v1", timeout: 60 }), { status: 200 });
        return new Response(JSON.stringify({ ok: true, phone: "9876543210" }), { status: 200 });
      }),
    );
    render(<PhoneLinkRow />);
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await screen.findByLabelText("OTP code");
    expect(calls[0]).toEqual({ url: "/api/auth/verifynow/send", body: { phone: "9876543210", intent: "link" } });
    fireEvent.change(screen.getByLabelText("OTP code"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(h.refreshProfile).toHaveBeenCalled());
    expect(calls[1]).toEqual({
      url: "/api/auth/verifynow/verify",
      body: { verificationId: "v1", code: "1234", intent: "link", phone: "9876543210" },
    });
  });

  it("shows the API's message when the number is taken", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "This number is already on another account" }), { status: 409 })));
    render(<PhoneLinkRow />);
    fireEvent.click(screen.getByRole("button", { name: "Add phone" }));
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("already on another account"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/profile/PhoneLinkRow.test.tsx`
Expected: FAIL (stub renders nothing).

- [ ] **Step 3: Implement**

```tsx
// components/profile/PhoneLinkRow.tsx
"use client";

import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import IndianPhoneInput from "@/components/IndianPhoneInput";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import { formatIndianPhoneDisplay } from "@/lib/utils/validation";

type Step = "idle" | "enter" | "code";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

/** Lets any signed-in user attach a verified phone, so phone-OTP login works for them. */
export default function PhoneLinkRow() {
  const { user, refreshProfile } = useAuth();
  const { profile } = useProfile(user);
  const [step, setStep] = useState<Step>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const current = profile?.phone ? formatIndianPhoneDisplay(profile.phone) : null;

  const reset = () => {
    setStep("idle");
    setPhone("");
    setCode("");
    setVerificationId(null);
    setError(null);
  };

  const send = async () => {
    if (phone.length !== 10) {
      setError("Enter a 10-digit mobile number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ verificationId: string }>("/api/auth/verifynow/send", { phone, intent: "link" });
      setVerificationId(r.verificationId);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!verificationId || code.trim().length < 4) {
      setError("Enter the code from the SMS");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/verifynow/verify", { verificationId, code: code.trim(), intent: "link", phone });
      await refreshProfile();
      toast.success("Phone added");
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="phone" className="mt-4 rounded-2xl border border-cb-border bg-cb-white px-4 py-4">
      <div className="flex items-center gap-3">
        <Phone className="h-5 w-5 shrink-0 text-cb-fg" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-cb-fg">Phone number</p>
          <p className="text-sm text-cb-muted-fg">{current ? `+91 ${current}` : "Sign in by mobile once a number is added."}</p>
        </div>
        {step === "idle" && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setStep("enter")}>
            {current ? "Change" : "Add phone"}
          </Button>
        )}
      </div>

      {step !== "idle" && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "enter" ? send() : verify());
          }}
        >
          {step === "enter" ? (
            <IndianPhoneInput id="link-phone" aria-label="Phone number" value={phone} onChange={setPhone} autoFocus />
          ) : (
            <Input
              id="link-code"
              aria-label="OTP code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the SMS"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-cb-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 rounded-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {step === "enter" ? "Send OTP" : "Verify"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

If `IndianPhoneInput` does not forward `aria-label` / `id` (check its props: it spreads `...inputProps` onto `Input`, so it does), wrap it in a `<label>` instead.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/profile app/profile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/profile/PhoneLinkRow.tsx components/profile/PhoneLinkRow.test.tsx
git commit -m "feat(profile): add or change phone with OTP so mobile sign-in works"
```

---
### Task 18: Playwright smoke spec at phone width, docs

**Files:**
- Create: `tests/admin-shell.spec.ts`
- Modify: `playwright.config.ts:16` (STATEFUL_SPECS) and the `projects` array
- Modify: `package.json` scripts
- Modify: `CLAUDE.md` (route list and admin section)

**Interfaces:**
- Consumes: `tests/purchase-auth.setup.ts` (signs in `TEST_ADMIN_EMAIL`, saves `tests/.auth/purchase-user.json`).
- Produces: project `admin-shell` (Pixel 5, 375×812, `storageState` from purchase-auth-setup); `npm run test:admin-shell`.

- [ ] **Step 1: Write the spec**

```ts
// tests/admin-shell.spec.ts
import { test, expect } from "@playwright/test";

const HAS_ADMIN = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test.describe("admin shell (phone)", () => {
  test.skip(!HAS_ADMIN, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set");

  test("walks every tab in the shell", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick access" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // No storefront chrome under /admin.
    await expect(page.getByLabel("Go to cart")).toHaveCount(0);

    const tabs: [string, string][] = [
      ["Orders", "Orders"],
      ["Pickups", "Stall pickups"],
      ["Refills", "Stall refills"],
      ["On-behalf", "On-behalf orders"],
      ["Impersonate", "Impersonate user"],
    ];
    for (const [tab, heading] of tabs) {
      await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: tab }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    }
    // Bottom bar reaches Orders in one tap.
    await page.getByRole("navigation", { name: "Quick access" }).getByRole("link", { name: "Orders" }).click();
    await expect(page).toHaveURL(/\/admin\/orders$/);
    // No horizontal page scroll at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("storefront shows one Admin entry", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("link", { name: "Open admin" })).toHaveAttribute("href", "/admin");
    await expect(page.getByText("Stall refills")).toHaveCount(0);
  });

  test("a signed-out visitor is sent to login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Register the project**

In `playwright.config.ts`, change the stateful regex to
`/(payment|e2e-purchase-flow|admin-impersonation|admin-shell)\.spec\.ts|.*\.setup\.ts/`
and add after the `admin-impersonation` project:

```ts
    // Admin shell smoke at phone width — the stall runs on phones. Reuses the
    // admin session from purchase-auth-setup; read-only, so retries are fine.
    {
      name: 'admin-shell',
      testMatch: /admin-shell\.spec\.ts/,
      dependencies: ['purchase-auth-setup'],
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
        storageState: 'tests/.auth/purchase-user.json',
      },
    },
```

In `package.json` scripts, after `"test:admin-impersonation"`: `"test:admin-shell": "playwright test --project=admin-shell",`.

- [ ] **Step 3: Run it**

Run: `npm run test:admin-shell`
Expected: 3 passed (or 3 skipped when the admin credentials are absent). If the spec fails on a heading name, fix the spec's expectation to the `PageHeader` title the page actually renders; do not loosen the assertions.

- [ ] **Step 4: Update CLAUDE.md**

In the "This Repo's Role" paragraph, replace the sentence listing the four admin routes with:

> Admin order management lives in this repo too, under one `/admin` section (`app/admin/layout.tsx` gates every route on `getUser()` + `isAdmin()` and wraps pages in `components/admin/AdminShell.tsx`; pages are built from `components/admin/kit/*`): `/admin` (action counts), `/admin/orders`, `/admin/pickup-orders`, `/admin/on-behalf-orders`, `/admin/stall-refills`, `/admin/impersonate`, `/admin/admins` (`super_admin` only). The former admin app (admin.cozyberries.com) was merged here on 2026-09-28 and then deleted.

In the admin-gated bullet, add `admins (super_admin via requireSuperAdmin())`, `dashboard/actions` to the list. In the route structure block add:

```
  /admin                     # Admin home: action counts (Redis 60s, cleared on status/shipment change)
  /admin/impersonate         # Find or create a customer, then act as them
  /admin/admins              # super_admin: list, add, remove admins (role in app_metadata)
  /api/admin/admins/*        # super_admin-gated role changes
  /api/admin/dashboard/actions
```

In "Auth Flow" add: "`POST /api/auth/verifynow/send|verify` accept `intent: "link"`: a signed-in user attaches a verified phone (`/profile#phone`), which is how Google-created admin accounts get mobile sign-in. A number on another account is refused with 409."

Add to "Key Conventions": "`ConditionalLayout` renders no storefront header or bottom nav under `/admin`; the shell supplies its own. `/admin/print/*` gets neither (bare children from `AdminShell`)."

- [ ] **Step 5: Commit**

```bash
git add tests/admin-shell.spec.ts playwright.config.ts package.json CLAUDE.md
git commit -m "test(admin): phone-width shell smoke spec; docs for the admin section"
```

---

### Task 19: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Lint and type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. Fix anything reported in the file that owns it and amend that task's commit message style (`fix(admin): …`).

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit`
Expected: all green. `grep -rn "UserPickerModal\|/admin/on-behalf-orders\"" components/HamburgerSheet.tsx app/profile/page.tsx` prints nothing.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; `/` and `/products/[id]` still listed as static (○) in the route summary, every `/admin/*` as dynamic (ƒ).

- [ ] **Step 4: Static-content guard**

Run: `npx playwright test tests/catalog.spec.ts --project=chromium -g "Static HTML carries real content"`
Expected: PASS (nothing under `lib/catalog/` or the public pages changed, this confirms it).

- [ ] **Step 5: Commit any fixes, then stop**

Do not push, merge or delete branches. Report the branch, the commit list (`git log --oneline develop..HEAD`), and the test commands run with their results.
