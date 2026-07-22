/**
 * Admin-only listing of orders placed under shadow mode
 * (`orders WHERE placed_by_admin_id IS NOT NULL`).
 *
 * Read-only in v1. Supports offset-based pagination and an optional
 * `admin_id` filter. Customer email is read from `orders.customer_email`
 * (denormalised at order time); the admin's public profile info is
 * resolved via `auth.admin.getUserById` per unique admin on the page.
 *
 * Only three fields are exposed per admin: `user_id`, `email`, `full_name`.
 * We deliberately do NOT leak phone, metadata, app_metadata, or timestamps.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import { UpstashService } from '@/lib/upstash';

const LOG_PREFIX = '[admin-on-behalf-orders]';

const DEFAULT_LIMIT = 25;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_OFFSET = 0;
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ShippingAddressLike = {
  full_name?: unknown;
} | null;

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  user_id: string;
  placed_by_admin_id: string | null;
  customer_email: string | null;
  shipping_address: ShippingAddressLike;
};

type AdminProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

type CustomerProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

type ResponseOrder = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  customer: CustomerProfile;
  placed_by_admin: AdminProfile | null;
};

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
}

function parseOffset(raw: string | null): number {
  if (raw === null) return DEFAULT_OFFSET;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return DEFAULT_OFFSET;
  return Math.max(0, parsed);
}

function extractShippingFullName(addr: ShippingAddressLike): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const raw = (addr as { full_name?: unknown }).full_name;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function extractUserFullName(user: SupabaseUser | null | undefined): string | null {
  if (!user) return null;
  const raw = (user.user_metadata as { full_name?: unknown } | undefined)
    ?.full_name;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user: sessionUser },
      error: sessionError,
    } = await sessionClient.auth.getUser();

    if (sessionError || !sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(sessionUser as unknown as SupabaseUser)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `on_behalf_orders_list:${sessionUser.id}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const offset = parseOffset(searchParams.get('offset'));
    const rawAdminId = searchParams.get('admin_id');
    const adminIdFilter =
      rawAdminId && UUID_REGEX.test(rawAdminId) ? rawAdminId : null;

    const adminClient = createAdminSupabaseClient();

    let query = adminClient
      .from('orders')
      .select(
        'id, order_number, status, total_amount, currency, created_at, user_id, placed_by_admin_id, customer_email, shipping_address',
        { count: 'exact' }
      )
      .not('placed_by_admin_id', 'is', null);

    if (adminIdFilter) {
      query = query.eq('placed_by_admin_id', adminIdFilter);
    }

    const { data, count, error: ordersError } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ordersError) {
      console.error(`${LOG_PREFIX} orders query error`, ordersError);
      return NextResponse.json(
        { error: 'Failed to load on-behalf orders' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as OrderRow[];
    const total = typeof count === 'number' ? count : 0;

    const uniqueAdminIds = Array.from(
      new Set(
        rows
          .map((r) => r.placed_by_admin_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const adminProfileMap = new Map<string, AdminProfile>();
    if (uniqueAdminIds.length > 0) {
      const settled = await Promise.allSettled(
        uniqueAdminIds.map((id) => adminClient.auth.admin.getUserById(id))
      );

      settled.forEach((result, idx) => {
        const adminId = uniqueAdminIds[idx];
        if (result.status !== 'fulfilled') {
          console.warn(
            `${LOG_PREFIX} getUserById rejected for admin=${adminId}`,
            result.reason
          );
          adminProfileMap.set(adminId, {
            user_id: adminId,
            email: null,
            full_name: null,
          });
          return;
        }
        const { data: userData, error: userError } = result.value;
        if (userError || !userData?.user) {
          console.warn(
            `${LOG_PREFIX} getUserById returned error for admin=${adminId}`,
            userError?.message
          );
          adminProfileMap.set(adminId, {
            user_id: adminId,
            email: null,
            full_name: null,
          });
          return;
        }
        const u = userData.user as SupabaseUser;
        adminProfileMap.set(adminId, {
          user_id: adminId,
          email: u.email ?? null,
          full_name: extractUserFullName(u),
        });
      });
    }

    const orders: ResponseOrder[] = rows.map((row) => {
      const placedByAdmin = row.placed_by_admin_id
        ? adminProfileMap.get(row.placed_by_admin_id) ?? {
            user_id: row.placed_by_admin_id,
            email: null,
            full_name: null,
          }
        : null;

      return {
        id: row.id,
        order_number: row.order_number,
        status: row.status,
        total_amount: row.total_amount,
        currency: row.currency,
        created_at: row.created_at,
        customer: {
          user_id: row.user_id,
          email: row.customer_email ?? null,
          full_name: extractShippingFullName(row.shipping_address),
        },
        placed_by_admin: placedByAdmin,
      };
    });

    return NextResponse.json(
      { orders, total, limit, offset },
      { status: 200 }
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} handler error`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
