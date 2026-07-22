import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

const {
  getUserMock,
  listUsersMock,
  checkRateLimitMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const listUsersMock = vi.fn();
  return {
    getUserMock,
    listUsersMock,
    checkRateLimitMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { listUsers: listUsersMock } },
  })),
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { checkRateLimit: checkRateLimitMock },
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest(query: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/users/search');
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function adminUser() {
  return {
    id: ADMIN_ID,
    email: 'admin@example.com',
    app_metadata: { role: 'admin' },
  };
}

function nonAdminUser() {
  return {
    id: ADMIN_ID,
    email: 'u@example.com',
    app_metadata: { role: 'customer' },
  };
}

function sampleUsers() {
  return [
    {
      id: 'u1',
      email: 'jane@example.com',
      phone: '+919876543210',
      user_metadata: { full_name: 'Jane Doe' },
      created_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'u2',
      email: 'john@example.com',
      phone: '+918888888888',
      user_metadata: { full_name: 'John Smith' },
      created_at: '2026-04-10T00:00:00.000Z',
    },
    {
      id: 'u3',
      email: 'alice@acme.io',
      phone: null,
      user_metadata: { full_name: 'Alice Wonderland' },
      created_at: '2026-04-05T00:00:00.000Z',
    },
    {
      id: 'u4',
      email: null,
      phone: '+917000000000',
      user_metadata: null,
      created_at: '2026-04-02T00:00:00.000Z',
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59 });
  // By default, return one page with fewer than LIST_PER_PAGE users so the
  // paging loop terminates after a single call.
  listUsersMock.mockResolvedValue({
    data: { users: sampleUsers() },
    error: null,
  });
});

describe('GET /api/admin/users/search', () => {
  it('returns 401 when unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(makeRequest({ q: 'jane' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not an admin', async () => {
    getUserMock.mockResolvedValue({
      data: { user: nonAdminUser() },
      error: null,
    });
    const res = await GET(makeRequest({ q: 'jane' }));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await GET(makeRequest({ q: 'jane' }));
    expect(res.status).toBe(429);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('returns empty users array for q shorter than 2 chars (not 400)', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: 'j' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: [] });
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('returns empty users array for whitespace-only q', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: '   ' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: [] });
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('matches by email (case-insensitive)', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: 'JANE' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([
      {
        id: 'u1',
        email: 'jane@example.com',
        phone: '+919876543210',
        full_name: 'Jane Doe',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ]);
  });

  it('matches by phone substring', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: '8888' }));
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe('u2');
  });

  it('matches by full_name substring', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: 'wonder' }));
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe('u3');
  });

  it('orders by created_at DESC and clamps limit', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: 'example.com', limit: '2' }));
    const body = await res.json();
    expect(body.users.map((u: { id: string }) => u.id)).toEqual(['u2', 'u1']);
  });

  it('clamps limit below 1 to 1', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ q: 'example', limit: '0' }));
    const body = await res.json();
    expect(body.users).toHaveLength(1);
  });

  it('clamps limit above 25 to 25', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    // Build 30 matching users to verify the cap.
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `big-${i}`,
      email: `match-${i}@example.com`,
      phone: null,
      user_metadata: { full_name: `User ${i}` },
      created_at: new Date(2026, 0, i + 1).toISOString(),
    }));
    listUsersMock.mockResolvedValueOnce({
      data: { users: many },
      error: null,
    });
    const res = await GET(makeRequest({ q: 'match', limit: '100' }));
    const body = await res.json();
    expect(body.users).toHaveLength(25);
  });

  it('returns 500 when listUsers errors', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    listUsersMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    });
    const res = await GET(makeRequest({ q: 'jane' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to search users');
  });
});
