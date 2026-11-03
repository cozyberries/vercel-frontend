// A chainable stand-in for the supabase-js query builder: each awaited query is recorded as an
// Op and answered by the test's handler.
export interface Op {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  columns?: string;
  filters: Array<[string, string, unknown]>;
}

export type Reply = { data?: unknown; error?: { message: string; code?: string } | null };

export function fakeAdmin(handler: (op: Op) => Reply | undefined) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, action: "select", filters: [] };
    const builder: Record<string, unknown> = {
      select(columns?: string) {
        if (op.action === "select") op.columns = columns;
        else op.columns = columns ?? op.columns;
        return builder;
      },
      insert(payload: unknown) {
        Object.assign(op, { action: "insert", payload });
        return builder;
      },
      update(payload: unknown) {
        Object.assign(op, { action: "update", payload });
        return builder;
      },
      upsert(payload: unknown, options: unknown) {
        Object.assign(op, { action: "upsert", payload, options });
        return builder;
      },
      delete() {
        op.action = "delete";
        return builder;
      },
      eq: (c: string, v: unknown) => (op.filters.push([c, "eq", v]), builder),
      gt: (c: string, v: unknown) => (op.filters.push([c, "gt", v]), builder),
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => builder,
      then(resolve: (r: Reply) => unknown, reject: (e: unknown) => unknown) {
        ops.push(op);
        try {
          const reply = handler(op) ?? {};
          return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null }).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return builder;
  };
  return { admin: { from } as never, ops };
}

export const filter = (op: Op, column: string) => op.filters.find(([c]) => c === column)?.[2];
