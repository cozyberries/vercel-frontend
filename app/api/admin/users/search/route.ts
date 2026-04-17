import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import { UpstashService } from '@/lib/upstash';

const LOG_PREFIX = '[admin-users-search]';

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 25;
const MIN_QUERY_LENGTH = 2;
const LIST_PER_PAGE = 1000;
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

type MatchableUser = {
  id: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  user_metadata?: { full_name?: unknown } | null;
  created_at: string;
};

type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  created_at: string;
};

function extractFullName(user: MatchableUser): string | null {
  const raw = user.user_metadata?.full_name;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function matchesQuery(user: MatchableUser, needle: string): boolean {
  const email = (user.email ?? '').toLowerCase();
  const phone = (user.phone ?? '').toLowerCase();
  const fullName = (extractFullName(user) ?? '').toLowerCase();
  return (
    email.includes(needle) ||
    phone.includes(needle) ||
    fullName.includes(needle)
  );
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
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

    if (!isAdmin(sessionUser as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `user_search:${sessionUser.id}`,
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
    const rawQuery = (searchParams.get('q') ?? '').trim();
    const limit = parseLimit(searchParams.get('limit'));

    if (rawQuery.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ users: [] }, { status: 200 });
    }

    const needle = rawQuery.toLowerCase();

    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: LIST_PER_PAGE,
    });

    if (error) {
      console.error(`${LOG_PREFIX} listUsers error`, error);
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      );
    }

    const users = (data?.users ?? []) as MatchableUser[];
    const filtered = users
      .filter((u) => matchesQuery(u, needle))
      .sort((a, b) => {
        const ta = Date.parse(a.created_at ?? '') || 0;
        const tb = Date.parse(b.created_at ?? '') || 0;
        return tb - ta;
      })
      .slice(0, limit)
      .map<PublicUser>((u) => ({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        full_name: extractFullName(u),
        created_at: u.created_at,
      }));

    return NextResponse.json({ users: filtered }, { status: 200 });
  } catch (err) {
    console.error(`${LOG_PREFIX} handler error`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
