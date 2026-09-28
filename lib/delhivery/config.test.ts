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
