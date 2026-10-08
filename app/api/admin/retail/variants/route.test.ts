import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, loadVariantOptions: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadVariantOptions: h.loadVariantOptions }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

beforeEach(() => {
  h.user = ADMIN_USER;
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/retail/variants", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("returns the options", async () => {
    h.loadVariantOptions.mockResolvedValue([{ slug: "a", productName: "Frock", size: "1-2Y", pricePaise: 100000, stock: 4 }]);
    expect(await (await GET()).json()).toEqual({ variants: [{ slug: "a", productName: "Frock", size: "1-2Y", pricePaise: 100000, stock: 4 }] });
  });
});
