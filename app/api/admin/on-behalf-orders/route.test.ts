import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_SESSION_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_A_ID = '00000000-0000-0000-0000-0000000000aa';
const ADMIN_B_ID = '00000000-0000-0000-0000-0000000000bb';

const {
  getUserMock,
  getUserByIdMock,
  checkRateLimitMock,
  selectMock,
  notMock,
  eqMock,
  orderMock,
  rangeMock,
  queryState,
} = vi.hoisted(() => {
  // Shared mutable state so the test can configure the result of `.range()`
  // (which is awaited as the thenable terminator of the query chain).
  const queryState: {
    data: unknown;
    count: number | null;
    error: { message: string } | null;
  } = { data: [], count: 0, error: null };

  const rangeMock = vi.fn(async () => ({
    data: queryState.data,
    count: queryState.count,
    error: queryState.error,
  }));
  const orderMock = vi.fn(() => ({ range: rangeMock }));
  const eqMock = vi.fn(() => ({ order: orderMock }));
  const notMock = vi.fn(() => ({ order: orderMock, eq: eqMock }));
  const selectMock = vi.fn(() => ({ not: notMock }));

  return {
    getUserMock: vi.fn(),
    getUserByIdMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    selectMock,
    notMock,
    eqMock,
    orderMock,
    rangeMock,
    queryState,
  };
});

const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  })),
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { checkRateLimit: checkRateLimitMock },
}));

vi.mock('@/lib/services/effective-user', () => ({
  isAdmin: (u: { app_metadata?: { role?: unknown } } | null | undefined) =>
    typeof u?.app_metadata?.role === 'string' &&
    (u.app_metadata.role === 'admin' || u.app_metadata.role === 'super_admin'),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest(query: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/on-behalf-orders');
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function adminUser() {
  return {
    id: ADMIN_SESSION_ID,
    email: 'admin@example.com',
    app_metadata: { role: 'admin' },
  };
}

function nonAdminUser() {
  return {
    id: ADMIN_SESSION_ID,
    email: 'u@example.com',
    app_metadata: { role: 'customer' },
  };
}

function sampleRows() {
  return [
    {
      id: 'order-1',
      order_number: 'CB-00001',
      status: 'processing',
      total_amount: 1299,
      currency: 'INR',
      created_at: '2026-04-10T10:00:00.000Z',
      user_id: 'customer-1',
      placed_by_admin_id: ADMIN_A_ID,
      customer_email: 'c1@example.com',
      shipping_address: {
        full_name: 'Customer One',
        city: 'Mumbai',
        state: 'MH',
        postal_code: '400001',
        country: 'IN',
        address_line_1: '1 Road',
      },
    },
    {
      id: 'order-2',
      order_number: 'CB-00002',
      status: 'shipped',
      total_amount: 499,
      currency: 'INR',
      created_at: '2026-04-09T10:00:00.000Z',
      user_id: 'customer-2',
      placed_by_admin_id: ADMIN_B_ID,
      customer_email: 'c2@example.com',
      shipping_address: null,
    },
  ];
}

function setupOrders(rows: ReturnType<typeof sampleRows>, count?: number) {
  queryState.data = rows;
  queryState.count = count ?? rows.length;
  queryState.error = null;
}

function setupOrdersError(message = 'boom') {
  queryState.data = null;
  queryState.count = null;
  queryState.error = { message };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59 });
  getUserByIdMock.mockImplementation(async (id: string) => ({
    data: {
      user: {
        id,
        email: `${id}@example.com`,
        user_metadata: { full_name: `Admin ${id.slice(-2).toUpperCase()}` },
      },
    },
    error: null,
  }));
  setupOrders(sampleRows());
});

describe('GET /api/admin/on-behalf-orders', () => {
  it('returns 401 when unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not an admin', async () => {
    getUserMock.mockResolvedValue({
      data: { user: nonAdminUser() },
      error: null,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 429 when rate-limited', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns orders with expected shape, total count, and admin/customer info', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    setupOrders(sampleRows(), 42);

    const res = await GET(makeRequest({ limit: '25', offset: '0' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(42);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.orders).toHaveLength(2);

    expect(notMock).toHaveBeenCalledWith('placed_by_admin_id', 'is', null);
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rangeMock).toHaveBeenCalledWith(0, 24);

    expect(body.orders[0]).toEqual({
      id: 'order-1',
      order_number: 'CB-00001',
      status: 'processing',
      total_amount: 1299,
      currency: 'INR',
      created_at: '2026-04-10T10:00:00.000Z',
      customer: {
        user_id: 'customer-1',
        email: 'c1@example.com',
        full_name: 'Customer One',
      },
      placed_by_admin: {
        user_id: ADMIN_A_ID,
        email: `${ADMIN_A_ID}@example.com`,
        full_name: 'Admin AA',
      },
    });

    // Customer with no shipping_address.full_name falls back to null.
    expect(body.orders[1].customer.full_name).toBeNull();
    expect(body.orders[1].placed_by_admin.user_id).toBe(ADMIN_B_ID);
  });

  it('clamps limit=0 up to 1', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ limit: '0' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(1);
    expect(rangeMock).toHaveBeenCalledWith(0, 0);
  });

  it('clamps limit=500 down to 100', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ limit: '500' }));
    const body = await res.json();
    expect(body.limit).toBe(100);
    expect(rangeMock).toHaveBeenCalledWith(0, 99);
  });

  it('clamps negative offset to 0', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await GET(makeRequest({ offset: '-5' }));
    const body = await res.json();
    expect(body.offset).toBe(0);
    expect(rangeMock).toHaveBeenCalledWith(0, 24);
  });

  it('applies admin_id filter when a valid UUID is provided', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    setupOrders([sampleRows()[0]], 1);
    const res = await GET(makeRequest({ admin_id: ADMIN_A_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(eqMock).toHaveBeenCalledWith('placed_by_admin_id', ADMIN_A_ID);
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].placed_by_admin.user_id).toBe(ADMIN_A_ID);
  });

  it('ignores invalid admin_id values (does not filter)', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    await GET(makeRequest({ admin_id: 'not-a-uuid' }));
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('degrades gracefully when getUserById returns an error for one admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    getUserByIdMock.mockImplementation(async (id: string) => {
      if (id === ADMIN_B_ID) {
        return { data: { user: null }, error: { message: 'not found' } };
      }
      return {
        data: {
          user: {
            id,
            email: `${id}@example.com`,
            user_metadata: { full_name: `Admin ${id.slice(-2).toUpperCase()}` },
          },
        },
        error: null,
      };
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    const orderA = body.orders.find(
      (o: { id: string }) => o.id === 'order-1'
    );
    const orderB = body.orders.find(
      (o: { id: string }) => o.id === 'order-2'
    );
    expect(orderA.placed_by_admin.email).toBe(`${ADMIN_A_ID}@example.com`);
    expect(orderB.placed_by_admin).toEqual({
      user_id: ADMIN_B_ID,
      email: null,
      full_name: null,
    });
  });

  it('degrades gracefully when getUserById rejects for one admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    getUserByIdMock.mockImplementation(async (id: string) => {
      if (id === ADMIN_A_ID) {
        throw new Error('network');
      }
      return {
        data: {
          user: {
            id,
            email: `${id}@example.com`,
            user_metadata: { full_name: `Admin ${id.slice(-2).toUpperCase()}` },
          },
        },
        error: null,
      };
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    const orderA = body.orders.find(
      (o: { id: string }) => o.id === 'order-1'
    );
    expect(orderA.placed_by_admin).toEqual({
      user_id: ADMIN_A_ID,
      email: null,
      full_name: null,
    });
  });

  it('returns 500 when the orders query returns an error', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    setupOrdersError();
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to load on-behalf orders');
  });

  it('returns 500 when the orders query throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    rangeMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
