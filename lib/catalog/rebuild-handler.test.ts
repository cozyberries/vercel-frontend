import { describe, expect, it, vi } from "vitest";
import { productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { handleRebuild, hasCronBearer, parseScope, type RebuildHandlerDeps } from "./rebuild-handler";
import { KEYS, createCatalogStore } from "./store";
import type { CatalogDb } from "./supabase";
import { FakeRedis } from "./testing/fake-redis";

function db(overrides: Partial<CatalogDb> = {}): CatalogDb {
  return {
    fetchProductRows: vi.fn(async () => productRows),
    fetchAllProductSlugs: vi.fn(async () => productRows.map((r) => r.slug)),
    fetchReferenceRows: vi.fn(async () => referenceRows),
    fetchRatingRows: vi.fn(async () => ratingRows),
    resolveProductSlugById: vi.fn(async () => null),
    ...overrides,
  };
}

function deps(overrides: Partial<RebuildHandlerDeps> = {}): RebuildHandlerDeps {
  return {
    store: createCatalogStore(new FakeRedis()),
    db: db(),
    revalidate: vi.fn(async () => {}),
    alert: vi.fn(),
    alertOnFailure: false,
    ...overrides,
  };
}

function post(body: unknown, path = "/api/catalog/rebuild"): Request {
  return new Request(`https://cozyberries.in${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("parseScope", () => {
  it("parses every scope kind and defaults to full", () => {
    const none = new URLSearchParams();
    expect(parseScope({ kind: "product", slug: "a" }, none)).toEqual({ kind: "product", slug: "a" });
    expect(parseScope({ kind: "product-id", id: 7 }, none)).toEqual({ kind: "product-id", id: "7" });
    expect(parseScope({ kind: "reference" }, none)).toEqual({ kind: "reference" });
    expect(parseScope({ kind: "product" }, none)).toEqual({ kind: "full" });
    expect(parseScope(null, none)).toEqual({ kind: "full" });
    expect(parseScope({ kind: "product", slug: "a" }, new URLSearchParams("full=1"))).toEqual({ kind: "full" });
  });
});

describe("hasCronBearer", () => {
  it("matches only the exact CRON_SECRET bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(hasCronBearer(new Request("https://x", { headers: { authorization: "Bearer s3cret" } }))).toBe(true);
    expect(hasCronBearer(new Request("https://x", { headers: { authorization: "Bearer nope" } }))).toBe(false);
    expect(hasCronBearer(new Request("https://x"))).toBe(false);
    delete process.env.CRON_SECRET;
    expect(hasCronBearer(new Request("https://x", { headers: { authorization: "Bearer " } }))).toBe(false);
  });
});

describe("handleRebuild", () => {
  it("rebuilds and reports the result", async () => {
    const d = deps();
    const res = await handleRebuild(post({ kind: "full" }), d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; scope: string; version: string; changed: boolean; productCount: number };
    expect(body.ok).toBe(true);
    expect(body.scope).toBe("full");
    expect(body.productCount).toBe(3);
    expect(body.changed).toBe(true);
    expect(d.revalidate).toHaveBeenCalled();
    expect(await d.store.exists(KEYS.lock)).toBe(false);
  });

  it("treats a GET without body as a full rebuild", async () => {
    const res = await handleRebuild(new Request("https://cozyberries.in/api/catalog/rebuild"), deps());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { scope: string }).scope).toBe("full");
  });

  it("returns 429 while another rebuild holds the lock", async () => {
    const d = deps();
    await d.store.acquireLock(10_000);
    const res = await handleRebuild(post({ kind: "full" }), d);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("rejects malformed JSON", async () => {
    const req = new Request("https://cozyberries.in/api/catalog/rebuild", { method: "POST", body: "{not json" });
    expect((await handleRebuild(req, deps())).status).toBe(400);
  });

  it("records failure meta, releases the lock and alerts only when asked", async () => {
    const failing = db({ fetchProductRows: vi.fn(async () => { throw new Error("db down"); }) });
    const quiet = deps({ db: failing });
    const res = await handleRebuild(post({ kind: "full" }), quiet);
    expect(res.status).toBe(500);
    expect((await quiet.store.readMeta())?.ok).toBe(false);
    expect((await quiet.store.readMeta())?.error).toBe("db down");
    expect(await quiet.store.exists(KEYS.lock)).toBe(false);
    expect(quiet.alert).not.toHaveBeenCalled();

    const loud = deps({ db: failing, alertOnFailure: true });
    await handleRebuild(post({ kind: "full" }), loud);
    expect(loud.alert).toHaveBeenCalledWith({ title: "Rebuild failed", details: "full: db down" });
  });
});
