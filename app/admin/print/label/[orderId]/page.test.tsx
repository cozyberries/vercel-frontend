// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  fromCalled: false,
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
    from: () => {
      h.fromCalled = true;
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: h.order, error: null }) }),
        }),
      };
    },
  })),
}));
vi.mock("@/lib/delhivery/client", () => ({
  getPackingSlipJSON: vi.fn(async () => ({ ok: true, data: { packages: [{ wbn: "WB1" }] } })),
}));
vi.mock("@/components/admin/LabelPrint", () => ({ default: () => null }));

import LabelPage from "./page";
import { getPackingSlipJSON } from "@/lib/delhivery/client";

const uuid = "11111111-1111-1111-1111-111111111111";

function propsFor(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

const props = propsFor(uuid);

beforeEach(() => {
  h.user = null;
  h.order = null;
  h.fromCalled = false;
  vi.mocked(getPackingSlipJSON).mockReset();
  vi.mocked(getPackingSlipJSON).mockResolvedValue({
    ok: true,
    data: { packages: [{ wbn: "WB1" }] },
  } as unknown as Awaited<ReturnType<typeof getPackingSlipJSON>>);
});

describe("/admin/print/label/[orderId] gate", () => {
  it("redirects anonymous users to /login, pinning the full redirect target", async () => {
    await expect(LabelPage(props)).rejects.toThrow(
      "REDIRECT:/login?redirect=/admin/orders"
    );
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

  it("shows an unrecognised-reference message and never queries orders", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    const el = await LabelPage(propsFor("not-a-valid-ref"));
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Unrecognised order reference.");
    expect(h.fromCalled).toBe(false);
  });

  it("shows an order-not-found message", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    h.order = null;
    const el = await LabelPage(props);
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Order not found.");
  });

  it("shows a non-Delhivery message when there is no tracking number", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    h.order = { id: "o-1", order_number: "ORD-1", tracking_number: null, carrier_name: "Delhivery" };
    const el = await LabelPage(props);
    const html = renderToStaticMarkup(el);
    expect(html).toContain("This order has no Delhivery shipment.");
  });

  it("shows a label-unavailable message when Delhivery returns no packages", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    h.order = { id: "o-1", order_number: "ORD-1", tracking_number: "WB1", carrier_name: "Delhivery" };
    vi.mocked(getPackingSlipJSON).mockResolvedValueOnce({
      ok: true,
      data: { packages: [] },
    } as unknown as Awaited<ReturnType<typeof getPackingSlipJSON>>);
    const el = await LabelPage(props);
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Label unavailable from Delhivery. Try again in a minute.");
  });
});
