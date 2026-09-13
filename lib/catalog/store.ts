// Redis I/O for the catalog. Every key lives under `cat:`. Reads from request handlers
// must go through lib/catalog/cache.ts; this module is used by the rebuild job, the
// events endpoint, the health endpoint and the cache layer's misses.
import { Redis, s } from "@upstash/redis";
import type { CatalogMeta, ProductDoc, Reference, Snapshot } from "./types";

export const KEYS = {
  productPrefix: "cat:product:",
  product: (slug: string) => `cat:product:${slug}`,
  snapshot: "cat:snapshot",
  reference: "cat:reference",
  version: "cat:version",
  meta: "cat:meta",
  lock: "cat:rebuild:lock",
  pending: (scopeKey: string) => `cat:pending:${scopeKey}`,
  published: "cat:events:published",
  muted: "cat:events:muted",
  trailing: "cat:events:trailing",
  alertFallback: "cat:alert:fallback",
} as const;

export const CATALOG_INDEX_NAME = "cozyberries-search";

/** The one Redis Search index the Free plan allows. Numbers/booleans/dates are FAST by default (sortable). */
export const CATALOG_INDEX_SCHEMA = s.object({
  name: s.string(),
  description: s.string(),
  features: s.string(),
  category_slug: s.keyword(),
  gender_slug: s.keyword(),
  size_slugs: s.keyword(),
  color_slugs: s.keyword(),
  age_slugs: s.keyword(),
  price: s.number("F64"),
  is_featured: s.boolean(),
  in_stock: s.boolean(),
  created_at: s.date(),
});

export interface SearchHit {
  key: string;
  score?: number;
  data?: unknown;
}

/** Subset of the @upstash/redis client used here, so tests can substitute FakeRedis. */
export interface RedisLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number; px?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  json: {
    get<T = unknown>(key: string, path?: string): Promise<T | null>;
    set(key: string, path: string, value: unknown): Promise<unknown>;
    mget<T = unknown>(keys: string[], path: string): Promise<T[]>;
  };
  pipeline(): {
    json: { set(key: string, path: string, value: unknown): unknown };
    set(key: string, value: unknown, opts?: { ex?: number }): unknown;
    del(...keys: string[]): unknown;
    exec<T = unknown[]>(): Promise<T>;
  };
  search: {
    createIndex(options: Record<string, unknown>): Promise<unknown>;
    index(options: { name: string; schema?: unknown }): {
      query(options: { filter: unknown; select?: Record<string, boolean>; limit?: number; offset?: number }): Promise<SearchHit[] | null>;
      waitIndexing(): Promise<unknown>;
      count(options: { filter: unknown }): Promise<{ count: number } | number>;
    };
  };
}

export interface WriteCatalogInput {
  docs: ProductDoc[];
  deleteSlugs: string[];
  reference?: Reference;
  snapshot?: Snapshot;
  meta: CatalogMeta;
}

export interface CatalogStore {
  readSnapshot(): Promise<Snapshot | null>;
  readReference(): Promise<Reference | null>;
  readProduct(slug: string): Promise<ProductDoc | null>;
  readDocs(slugs: string[]): Promise<ProductDoc[]>;
  readMeta(): Promise<CatalogMeta | null>;
  readVersion(): Promise<string | null>;
  writeMeta(meta: CatalogMeta): Promise<void>;
  writeProduct(doc: ProductDoc): Promise<void>;
  writeCatalog(input: WriteCatalogInput): Promise<void>;
  ensureIndex(): Promise<void>;
  waitIndexing(): Promise<void>;
  indexDocCount(): Promise<number | null>;
  searchKeys(filter: unknown, limit: number): Promise<string[]>;
  acquireLock(ttlMs: number): Promise<string | null>;
  releaseLock(token: string): Promise<void>;
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

/** JSON.GET/MGET with path "$" return a one-element array per key. */
function unwrap<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return value as T;
}

export function createCatalogStore(redis: RedisLike): CatalogStore {
  const index = () => redis.search.index({ name: CATALOG_INDEX_NAME, schema: CATALOG_INDEX_SCHEMA });

  return {
    async readSnapshot() {
      return unwrap<Snapshot>(await redis.json.get(KEYS.snapshot, "$"));
    },
    async readReference() {
      return unwrap<Reference>(await redis.json.get(KEYS.reference, "$"));
    },
    async readProduct(slug) {
      return unwrap<ProductDoc>(await redis.json.get(KEYS.product(slug), "$"));
    },
    async readDocs(slugs) {
      if (slugs.length === 0) return [];
      const results = await redis.json.mget<unknown>(slugs.map(KEYS.product), "$");
      return results.map((r) => unwrap<ProductDoc>(r)).filter((d): d is ProductDoc => d !== null);
    },
    async readMeta() {
      return unwrap<CatalogMeta>(await redis.json.get(KEYS.meta, "$"));
    },
    async readVersion() {
      return (await redis.get<string>(KEYS.version)) ?? null;
    },
    async writeMeta(meta) {
      await redis.json.set(KEYS.meta, "$", meta);
    },
    async writeProduct(doc) {
      await redis.json.set(KEYS.product(doc.slug), "$", doc);
    },
    async writeCatalog(input) {
      const pipeline = redis.pipeline();
      for (const doc of input.docs) pipeline.json.set(KEYS.product(doc.slug), "$", doc);
      if (input.deleteSlugs.length > 0) pipeline.del(...input.deleteSlugs.map(KEYS.product));
      if (input.reference) pipeline.json.set(KEYS.reference, "$", input.reference);
      if (input.snapshot) {
        pipeline.json.set(KEYS.snapshot, "$", input.snapshot);
        pipeline.set(KEYS.version, input.snapshot.version);
      }
      pipeline.json.set(KEYS.meta, "$", input.meta);
      await pipeline.exec();
    },
    async ensureIndex() {
      await redis.search.createIndex({
        name: CATALOG_INDEX_NAME,
        prefix: KEYS.productPrefix,
        dataType: "json",
        language: "english",
        existsOk: true,
        schema: CATALOG_INDEX_SCHEMA,
      });
    },
    async waitIndexing() {
      await index().waitIndexing();
    },
    async indexDocCount() {
      try {
        // The SDK returns `{ count }` (a negative count means the index does not exist).
        const result = await index().count({ filter: { price: { $gte: 0 } } });
        const count = typeof result === "number" ? result : result.count;
        return count < 0 ? null : count;
      } catch {
        return null;
      }
    },
    async searchKeys(filter, limit) {
      const hits = await index().query({ filter, select: { name: true }, limit });
      // The SDK answers null, not an error, when the index does not exist.
      if (!hits) throw new Error(`search index ${CATALOG_INDEX_NAME} does not exist`);
      return hits.map((hit) => hit.key);
    },
    async acquireLock(ttlMs) {
      const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await redis.set(KEYS.lock, token, { nx: true, px: ttlMs });
      return result === "OK" ? token : null;
    },
    async releaseLock(token) {
      const current = await redis.get<string>(KEYS.lock);
      if (current === token) await redis.del(KEYS.lock);
    },
    async setIfAbsent(key, ttlSeconds) {
      const result = await redis.set(key, 1, { nx: true, ex: ttlSeconds });
      return result === "OK";
    },
    async exists(key) {
      return (await redis.exists(key)) > 0;
    },
    async incrWithTtl(key, ttlSeconds) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ttlSeconds);
      return count;
    },
  };
}

let singleton: CatalogStore | null = null;

/** Lazy singleton over UPSTASH_REDIS_REST_URL/TOKEN. Constructed on first use so tests never touch it. */
export function catalogStore(): CatalogStore {
  if (!singleton) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("[catalog] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
    singleton = createCatalogStore(new Redis({ url, token }) as unknown as RedisLike);
  }
  return singleton;
}
