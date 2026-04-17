import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { verifyActingAs } from '@/lib/utils/impersonation-cookie';

export const ACTING_AS_COOKIE_NAME = 'acting_as';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export type EffectiveUserResult =
  | {
      ok: true;
      userId: string;
      actingAdminId: string | null;
      client: SupabaseClient;
      sessionUser: User;
      clearCookie: false;
    }
  | {
      ok: false;
      status: 401 | 403 | 410;
      reason:
        | 'unauthenticated'
        | 'forbidden_not_admin'
        | 'forbidden_actor_mismatch'
        | 'target_missing';
      clearCookie: boolean;
    };

export function isAdmin(user: User): boolean {
  const role = (user.app_metadata as { role?: unknown } | undefined)?.role;
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

/**
 * Returns `client.from(table)` — a thin wrapper that marks scoped access.
 *
 * IMPORTANT: Callers MUST still apply `.eq('user_id', userId)` on reads and set
 * `user_id` on inserts. This helper exists to provide a single future point
 * where we can layer stricter enforcement. Phase 1 does not enforce at the
 * type level.
 */
export function scopedFrom(
  client: SupabaseClient,
  table: string,
  _userId: string
) {
  return client.from(table);
}

export async function getEffectiveUser(): Promise<EffectiveUserResult> {
  const sessionClient = (await createServerSupabaseClient()) as SupabaseClient;

  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      reason: 'unauthenticated',
      clearCookie: false,
    };
  }

  const cookieStore = await cookies();
  const actingAsCookie = cookieStore.get(ACTING_AS_COOKIE_NAME)?.value;

  if (!actingAsCookie) {
    return {
      ok: true,
      userId: user.id,
      actingAdminId: null,
      client: sessionClient,
      sessionUser: user,
      clearCookie: false,
    };
  }

  const payload = verifyActingAs(actingAsCookie);
  if (!payload) {
    return {
      ok: false,
      status: 403,
      reason: 'forbidden_actor_mismatch',
      clearCookie: true,
    };
  }

  if (!isAdmin(user)) {
    return {
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    };
  }

  if (payload.actor_id !== user.id) {
    return {
      ok: false,
      status: 403,
      reason: 'forbidden_actor_mismatch',
      clearCookie: true,
    };
  }

  const serviceClient = createAdminSupabaseClient() as SupabaseClient;
  const { data: targetData, error: targetError } =
    await serviceClient.auth.admin.getUserById(payload.target_id);

  if (targetError || !targetData?.user) {
    return {
      ok: false,
      status: 410,
      reason: 'target_missing',
      clearCookie: true,
    };
  }

  return {
    ok: true,
    userId: payload.target_id,
    actingAdminId: payload.actor_id,
    client: serviceClient,
    sessionUser: user,
    clearCookie: false,
  };
}
