import { vi } from "vitest";

export const ADMIN_USER = { id: "admin-1", email: "asha@cozyberries.in", app_metadata: { role: "admin" }, user_metadata: { full_name: "Asha" } };
export const CUSTOMER_USER = { id: "c-1", app_metadata: { role: "customer" } };

/** A PostgREST builder stand-in: every method chains, awaiting it resolves to `result`. */
export function chain(result: { data: unknown; error: unknown }) {
  const ops: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "in", "order", "single", "maybeSingle", "gte", "lt", "not"]) {
    builder[name] = vi.fn((...args: unknown[]) => {
      ops.push([name, args]);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return Object.assign(builder, { ops });
}
