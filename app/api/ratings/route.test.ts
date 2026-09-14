import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, upstashGetMock, upstashSetMock, queryRows, adminGetUserByIdMock } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    upstashGetMock: vi.fn(),
    upstashSetMock: vi.fn(async () => undefined),
    queryRows: { value: [] as any[] },
    adminGetUserByIdMock: vi.fn(async (id: string) => ({
      data: { user: { user_metadata: { full_name: `Name ${id}` } } },
    })),
  }));

function makeQuery() {
  const q: any = {
    select: () => q,
    order: () => q,
    eq: () => q,
    then: (resolve: any) => resolve({ data: queryRows.value, error: null }),
  };
  return q;
}

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => makeQuery(),
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { getUserById: adminGetUserByIdMock } },
    storage: { from: () => ({}) },
  })),
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { get: upstashGetMock, set: upstashSetMock },
}));

vi.mock('@/lib/services/telegram', () => ({ notifyNewRating: vi.fn() }));

import { GET } from './route';
import { NextRequest } from 'next/server';

function request() {
  return new NextRequest('http://localhost/api/ratings?product_slug=tee');
}

const ROWS = [
  { id: 'r1', user_id: 'alice', product_slug: 'tee', rating: 5 },
  { id: 'r2', user_id: 'bob', product_slug: 'tee', rating: 4 },
];

describe('GET /api/ratings does not leak reviewer user ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRows.value = ROWS.map((r) => ({ ...r }));
    upstashGetMock.mockResolvedValue(null);
  });

  it('omits every user_id for an unauthenticated caller', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    for (const row of body) {
      expect(row).not.toHaveProperty('user_id');
      // The display name the UI actually renders survives.
      expect(row).toHaveProperty('user_name');
    }
    expect(res.headers.get('Cache-Control')).toContain('public');
  });

  it('echoes back only the viewer own user_id when signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'alice' } }, error: null });

    const res = await GET(request());
    const body = await res.json();

    const alice = body.find((r: any) => r.id === 'r1');
    const bob = body.find((r: any) => r.id === 'r2');

    expect(alice.user_id).toBe('alice');
    expect(bob).not.toHaveProperty('user_id');
    // Personalised response must never be shared by a CDN.
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('strips user_id on the Redis cache-hit path too', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    upstashGetMock.mockResolvedValue(
      ROWS.map((r) => ({ ...r, user_name: `Name ${r.user_id}` }))
    );

    const res = await GET(request());
    const body = await res.json();

    expect(res.headers.get('X-Cache-Status')).toBe('HIT');
    for (const row of body) {
      expect(row).not.toHaveProperty('user_id');
    }
  });
});
