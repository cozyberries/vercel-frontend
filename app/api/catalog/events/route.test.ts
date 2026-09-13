import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "@/lib/catalog/store";
import { FakeRedis } from "@/lib/catalog/testing/fake-redis";

const store = createCatalogStore(new FakeRedis());
vi.mock("@/lib/catalog/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog/store")>();
  return { ...original, catalogStore: () => store };
});

const limit = vi.fn(async () => ({ success: true }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    class {
      limit = limit;
    },
    { slidingWindow: () => "sliding" },
  ),
}));

const publishJSON = vi.fn(async () => ({ messageId: "qs-1" }));
vi.mock("@upstash/qstash", () => ({ Client: class { publishJSON = publishJSON; } }));
vi.mock("@upstash/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@upstash/redis")>();
  return { ...actual, Redis: class {} };
});

import { POST } from "./route";

function request(body: unknown, secret?: string, path = "/api/catalog/events"): Request {
  return new Request(`https://cozyberries.in${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(secret ? { "x-catalog-secret": secret } : {}) },
  });
}

describe("POST /api/catalog/events", () => {
  beforeEach(() => {
    process.env.CATALOG_WEBHOOK_SECRET = "top-secret";
    process.env.CATALOG_BASE_URL = "https://cozyberries.in";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    publishJSON.mockClear();
    limit.mockClear();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await POST(request({ table: "products", slug: "a" }))).status).toBe(401);
    expect((await POST(request({ table: "products", slug: "a" }, "wrong"))).status).toBe(401);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("rate limits", async () => {
    limit.mockResolvedValueOnce({ success: false });
    expect((await POST(request({ table: "products", slug: "a" }, "top-secret"))).status).toBe(429);
  });

  it("rejects malformed JSON", async () => {
    expect((await POST(request("{nope", "top-secret"))).status).toBe(400);
  });

  it("publishes a rebuild message for a valid event", async () => {
    const res = await POST(request({ table: "products", type: "UPDATE", slug: "frock-1" }, "top-secret"));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { outcomes: Array<{ status: string }> };
    expect(body.outcomes[0]?.status).toBe("published");
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ url: "https://cozyberries.in/api/catalog/rebuild", body: { kind: "product", slug: "frock-1" }, delay: 8 }));
  });

  it("supports a manual full rebuild via ?full=1", async () => {
    const res = await POST(request({}, "top-secret", "/api/catalog/events?full=1"));
    expect(res.status).toBe(202);
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ body: { kind: "full" } }));
  });
});
