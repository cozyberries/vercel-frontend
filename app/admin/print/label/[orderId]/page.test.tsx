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
