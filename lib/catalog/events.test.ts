import { describe, expect, it, vi } from "vitest";
import {
  BURST_THRESHOLD,
  DEBOUNCE_SECONDS,
  MUTE_SECONDS,
  buildMessage,
  deriveScopes,
  processEvent,
  processScope,
  type EventDeps,
  type PublishMessage,
} from "./events";
import { KEYS, createCatalogStore } from "./store";
import { FakeRedis } from "./testing/fake-redis";

function makeDeps(redis = new FakeRedis()): EventDeps & { published: PublishMessage[]; redis: FakeRedis } {
  const published: PublishMessage[] = [];
  return {
    redis,
    published,
    store: createCatalogStore(redis),
    baseUrl: "https://cozyberries.in",
    now: () => 1_700_000_000_000,
    publish: vi.fn(async (message: PublishMessage) => {
      published.push(message);
      return { messageId: `msg-${published.length}` };
    }),
  };
}

describe("deriveScopes", () => {
  it("maps product rows to product scopes, including a renamed slug", () => {
    expect(deriveScopes({ table: "products", type: "UPDATE", slug: "A" })).toEqual([{ kind: "product", slug: "a" }]);
    expect(deriveScopes({ table: "products", type: "UPDATE", slug: "new", old_slug: "old" })).toEqual([
      { kind: "product", slug: "new" },
      { kind: "product", slug: "old" },
    ]);
    expect(deriveScopes({ table: "products", type: "DELETE" })).toEqual([{ kind: "full" }]);
  });
  it("maps child tables through product_slug or product_id", () => {
    expect(deriveScopes({ table: "product_variants", product_slug: "x" })).toEqual([{ kind: "product", slug: "x" }]);
    expect(deriveScopes({ table: "ratings", product_id: 12 })).toEqual([{ kind: "product-id", id: "12" }]);
    expect(deriveScopes({ table: "product_images" })).toEqual([{ kind: "full" }]);
  });
  it("maps reference tables and unknown tables", () => {
    expect(deriveScopes({ table: "categories" })).toEqual([{ kind: "reference" }]);
    expect(deriveScopes({ table: "colors" })).toEqual([{ kind: "reference" }]);
    expect(deriveScopes({ table: "something_else" })).toEqual([{ kind: "full" }]);
    expect(deriveScopes({})).toEqual([{ kind: "full" }]);
  });
});

describe("buildMessage", () => {
  it("targets the rebuild endpoint with delay, bucketed dedup id and flow control", () => {
    const message = buildMessage({ kind: "product", slug: "a" }, "https://cozyberries.in", 1_700_000_000_000);
    expect(message).toEqual({
      url: "https://cozyberries.in/api/catalog/rebuild",
      body: { kind: "product", slug: "a" },
      delay: DEBOUNCE_SECONDS,
      deduplicationId: `product:a:${Math.floor(1_700_000_000_000 / (DEBOUNCE_SECONDS * 1000))}`,
      flowControl: { key: "catalog-rebuild", parallelism: 1 },
      retries: 3,
      failureCallback: "https://cozyberries.in/api/catalog/rebuild-failed",
      label: "catalog",
    });
  });
});

describe("processScope", () => {
  it("publishes the first event for a scope and dedupes repeats inside the window", async () => {
    const deps = makeDeps();
    expect(await processScope({ kind: "product", slug: "a" }, deps)).toEqual({ status: "published", scopeKey: "product:a", messageId: "msg-1" });
    expect(await processScope({ kind: "product", slug: "a" }, deps)).toEqual({ status: "deduped", scopeKey: "product:a" });
    expect(await processScope({ kind: "product", slug: "b" }, deps)).toEqual({ status: "published", scopeKey: "product:b", messageId: "msg-2" });
    expect(deps.published).toHaveLength(2);
  });

  it("publishes again once the debounce window has passed", async () => {
    const deps = makeDeps();
    await processScope({ kind: "product", slug: "a" }, deps);
    deps.redis.now = () => Date.now() + (DEBOUNCE_SECONDS + 1) * 1000;
    expect((await processScope({ kind: "product", slug: "a" }, deps)).status).toBe("published");
  });

  it("collapses a burst into one full rebuild and mutes further events", async () => {
    const deps = makeDeps();
    for (let i = 0; i < BURST_THRESHOLD; i += 1) {
      expect((await processScope({ kind: "product", slug: `p${i}` }, deps)).status).toBe("published");
    }
    const collapsed = await processScope({ kind: "product", slug: "one-more" }, deps);
    expect(collapsed).toEqual({ status: "collapsed", scopeKey: "full", messageId: `msg-${BURST_THRESHOLD + 1}` });
    expect(deps.published.at(-1)?.body).toEqual({ kind: "full" });
    expect(deps.published.at(-1)?.deduplicationId).toBe(`full:${Math.floor(1_700_000_000_000 / 60_000)}`);
    expect(await processScope({ kind: "product", slug: "another" }, deps)).toEqual({ status: "muted", scopeKey: "product:another" });
    expect(await deps.store.exists(KEYS.muted)).toBe(true);
    const trailing = deps.published.at(-1);
    expect(trailing?.body).toEqual({ kind: "full" });
    expect(trailing?.delay).toBe(MUTE_SECONDS);
    expect(trailing?.deduplicationId).toBe(`full:trailing:${Math.floor(1_700_000_000_000 / (MUTE_SECONDS * 1000))}`);
    const before = deps.published.length;
    expect((await processScope({ kind: "product", slug: "yet-another" }, deps)).status).toBe("muted");
    expect(deps.published).toHaveLength(before);
  });

  it("handles a payload end to end", async () => {
    const deps = makeDeps();
    const outcomes = await processEvent({ table: "products", type: "UPDATE", slug: "new", old_slug: "old" }, deps);
    expect(outcomes.map((o) => o.status)).toEqual(["published", "published"]);
  });
});
