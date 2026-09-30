import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AdminRole = "admin" | "super_admin";
export interface AdminAccount {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: AdminRole;
  created_at: string;
}

export function roleOf(user: Pick<User, "app_metadata">): string | undefined {
  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  return typeof role === "string" ? role : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `auth.admin.getUserById` in the installed `@supabase/auth-js` validates its argument
 * as a UUID and throws synchronously before its own try/catch, rather than returning
 * `{ error }`. Callers must reject a non-UUID id themselves (as a 404 — it cannot
 * exist) before calling it, or the throw surfaces as an unhandled 500.
 */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Looks up one auth user by id, treating "not a UUID", "no such user", and a thrown
 * error (see `isUuid` doc) all as "not found" — the one outcome every caller needs to
 * turn into a 404. Never throws.
 */
export async function safeGetUserById(admin: SupabaseClient, id: string): Promise<User | null> {
  if (!isUuid(id)) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data?.user) return null;
    return data.user;
  } catch (e) {
    console.error("[admin-accounts] getUserById threw:", e);
    return null;
  }
}

export function toAdminAccount(user: User): AdminAccount {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone || null,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: roleOf(user) === "super_admin" ? "super_admin" : "admin",
    created_at: user.created_at,
  };
}

const MAX_PAGES = 20;

/** Every account whose role is admin or super_admin. Reads only; caller has passed requireSuperAdmin(). */
export async function listAdminAccounts(admin: SupabaseClient, perPage = 1000): Promise<AdminAccount[]> {
  const out: AdminAccount[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      const role = roleOf(u);
      if (role === "admin" || role === "super_admin") out.push(toAdminAccount(u));
    }
    if (users.length < perPage) break;
  }
  return out.sort((a, b) => {
    if (a.role !== b.role) return a.role === "super_admin" ? -1 : 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });
}
