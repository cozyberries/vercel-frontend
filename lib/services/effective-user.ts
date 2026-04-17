import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { verifyActingAs } from '@/lib/utils/impersonation-cookie';

export const ACTING_AS_COOKIE_NAME = 'acting_as';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export type EffectiveUserFailureReason =
  | 'unauthenticated'
  | 'forbidden_not_admin'
  | 'cookie_invalid'
  | 'cookie_expired'
  | 'actor_mismatch'
  | 'target_missing'
  | 'internal_error';

export type EffectiveUserResult =
  | {
      ok: true;
      userId: string;
      actingAdminId: string | null;
      client: SupabaseClient;
      sessionUser: User;
    }
  | {
      ok: false;
      status: 401 | 403 | 410 | 500;
      reason: EffectiveUserFailureReason;
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
// TODO(phase-2+): enforce `.eq('user_id', userId)` / set `user_id` on writes at the
// type or runtime layer. See docs/superpowers/specs/2026-04-17-admin-order-on-behalf-design.md §"Auth mechanics".
export function scopedFrom(
  client: SupabaseClient,
  table: string,
  _userId: string
) {
  return client.from(table);
}

export async function getEffectiveUser(): Promise<EffectiveUserResult> {
  const sessionClient = (await createServerSupabaseClient()) as SupabaseClient;

  let user: User | null;
  try {
    const {
      data: { user: sessionUser },
    } = await sessionClient.auth.getUser();
    user = sessionUser;
  } catch (err) {
    console.error('[impersonation] getEffectiveUser internal error', err);
    return {
      ok: false,
      status: 500,
      reason: 'internal_error',
      clearCookie: false,
    };
  }

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
    };
  }

  // Admin check comes before cookie verification: a non-admin presenting any
  // cookie (tampered or not) should be rejected as not-admin, not as a cookie
  // failure.
  if (!isAdmin(user)) {
    return {
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    };
  }

  const verifyResult = verifyActingAs(actingAsCookie);
  if (verifyResult.status === 'expired') {
    return {
      ok: false,
      status: 403,
      reason: 'cookie_expired',
      clearCookie: true,
    };
  }
  if (verifyResult.status === 'invalid') {
    return {
      ok: false,
      status: 403,
      reason: 'cookie_invalid',
      clearCookie: true,
    };
  }

  const payload = verifyResult.payload;

  if (payload.actor_id !== user.id) {
    return {
      ok: false,
      status: 403,
      reason: 'actor_mismatch',
      clearCookie: true,
    };
  }

  const serviceClient = createAdminSupabaseClient() as SupabaseClient;

  try {
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
  } catch (err) {
    console.error('[impersonation] getEffectiveUser internal error', err);
    return {
      ok: false,
      status: 500,
      reason: 'internal_error',
      clearCookie: false,
    };
  }

  return {
    ok: true,
    userId: payload.target_id,
    actingAdminId: payload.actor_id,
    client: serviceClient,
    sessionUser: user,
  };
}
