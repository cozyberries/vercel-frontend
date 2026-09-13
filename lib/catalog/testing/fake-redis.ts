// In-memory RedisLike for unit tests. Supports the commands the catalog uses plus a
// small Redis Search filter evaluator ($must/$should/$or/$and/$eq/$in/$gte/$lte/$smart).
import type { RedisLike, SearchHit } from "../store";

type Entry = { value: unknown; expiresAt: number | null };

export class FakeRedis implements RedisLike {
  readonly store = new Map<string, Entry>();
  readonly indexes = new Map<string, { prefix: string }>();
  now: () => number = () => Date.now();

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.live(key)?.value ?? null) as T | null;
  }
  async set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number; px?: number }): Promise<unknown> {
    if (opts?.nx && this.live(key)) return null;
    const ttlMs = opts?.px ?? (opts?.ex !== undefined ? opts.ex * 1000 : undefined);
    this.store.set(key, { value, expiresAt: ttlMs === undefined ? null : this.now() + ttlMs });
    return "OK";
  }
  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) if (this.store.delete(key)) deleted += 1;
    return deleted;
  }
  async exists(...keys: string[]): Promise<number> {
    return keys.filter((key) => this.live(key) !== undefined).length;
  }
  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + 1;
    this.store.set(key, { value: next, expiresAt: entry?.expiresAt ?? null });
    return next;
  }
  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now() + seconds * 1000;
    return 1;
  }

  json = {
    get: async <T = unknown>(key: string, path?: string): Promise<T | null> => {
      const entry = this.live(key);
      if (!entry) return null;
      return (path === "$" ? [entry.value] : entry.value) as T;
    },
    set: async (key: string, _path: string, value: unknown): Promise<unknown> => {
      this.store.set(key, { value: structuredClone(value), expiresAt: null });
      return "OK";
    },
    mget: async <T = unknown>(keys: string[], path: string): Promise<T[]> =>
      keys.map((key) => {
        const entry = this.live(key);
        return (entry ? (path === "$" ? [entry.value] : entry.value) : null) as T;
      }),
  };

  pipeline() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      json: {
        set: (key: string, path: string, value: unknown) => {
          ops.push(() => this.json.set(key, path, value));
          return chain;
        },
      },
      set: (key: string, value: unknown, opts?: { ex?: number }) => {
        ops.push(() => this.set(key, value, opts));
        return chain;
      },
      del: (...keys: string[]) => {
        ops.push(() => this.del(...keys));
        return chain;
      },
      exec: async <T = unknown[]>(): Promise<T> => {
        const results: unknown[] = [];
        for (const op of ops) results.push(await op());
        return results as T;
      },
    };
    return chain;
  }

  search = {
    createIndex: async (options: Record<string, unknown>): Promise<unknown> => {
      const name = String(options.name);
      // Upstash rejects a duplicate index unless existsOk is set; the fake must too, or
      // the store's idempotency test would pass even if ensureIndex dropped existsOk.
      if (this.indexes.has(name) && options.existsOk !== true) {
        throw new Error(`index ${name} already exists`);
      }
      const prefix = options.prefix;
      this.indexes.set(name, { prefix: Array.isArray(prefix) ? String(prefix[0]) : String(prefix) });
      return {};
    },
    index: (options: { name: string }) => ({
      // Like the SDK: null when the index has not been created.
      query: async (q: { filter: unknown; limit?: number }): Promise<SearchHit[] | null> =>
        !this.indexes.has(options.name)
          ? null
          : this.documents(options.name)
          .filter(({ doc }) => matches(doc, q.filter))
          .slice(0, q.limit ?? 10)
          .map(({ key }) => ({ key, score: 1, data: {} })),
      waitIndexing: async (): Promise<unknown> => "OK",
      // Like the SDK: `{ count: -1 }` when the index has not been created.
      count: async (q: { filter: unknown }): Promise<{ count: number }> => ({
        count: this.indexes.has(options.name)
          ? this.documents(options.name).filter(({ doc }) => matches(doc, q.filter)).length
          : -1,
      }),
    }),
  };

  private documents(indexName: string): Array<{ key: string; doc: Record<string, unknown> }> {
    const prefix = this.indexes.get(indexName)?.prefix ?? "cat:product:";
    return [...this.store.keys()]
      .filter((key) => key.startsWith(prefix) && this.live(key) !== undefined)
      .map((key) => ({ key, doc: this.store.get(key)!.value as Record<string, unknown> }));
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  return asArray(value).map((v) => String(v ?? "")).join(" ").toLowerCase();
}

function matches(doc: Record<string, unknown>, clause: unknown): boolean {
  if (!clause || typeof clause !== "object") return true;
  const record = clause as Record<string, unknown>;
  if ("$must" in record) return asArray(record.$must).every((c) => matches(doc, c));
  if ("$and" in record) return asArray(record.$and).every((c) => matches(doc, c));
  if ("$should" in record) return asArray(record.$should).some((c) => matches(doc, c));
  if ("$or" in record) return asArray(record.$or).some((c) => matches(doc, c));
  if ("$mustNot" in record) return !asArray(record.$mustNot).some((c) => matches(doc, c));
  return Object.entries(record).every(([field, condition]) => {
    if (field === "$boost") return true;
    const value = doc[field];
    if (condition && typeof condition === "object") {
      const cond = condition as Record<string, unknown>;
      if ("$eq" in cond) return asArray(value).includes(cond.$eq);
      if ("$in" in cond) return asArray(value).some((v) => asArray(cond.$in).includes(v));
      if ("$gte" in cond) return Number(value) >= Number(cond.$gte);
      if ("$lte" in cond) return Number(value) <= Number(cond.$lte);
      const needle = cond.$smart ?? cond.$fuzzy ?? cond.$phrase;
      if (needle !== undefined) {
        const n = typeof needle === "object" && needle ? String((needle as Record<string, unknown>).value) : String(needle);
        return text(value).includes(n.toLowerCase());
      }
      return false;
    }
    return asArray(value).includes(condition);
  });
}
