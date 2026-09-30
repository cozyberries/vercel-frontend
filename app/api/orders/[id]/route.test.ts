import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const { getEffectiveUserMock, effectiveUserErrorResponseMock, cacheServiceMock } =
  vi.hoisted(() => ({
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    cacheServiceMock: {
      getOrderDetails: vi.fn().mockResolvedValue({ data: null, ttl: 0, isStale: false }),
      setOrderDetails: vi.fn().mockResolvedValue(undefined),
      clearAllOrders: vi.fn().mockResolvedValue(undefined),
      clearOrderDetails: vi.fn().mockResolvedValue(undefined),
    },
  }));

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/services/cache', () => ({
  default: cacheServiceMock,
}));

import { GET, PATCH } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheServiceMock.getOrderDetails.mockResolvedValue({ data: null, ttl: 0, isStale: false });
  });

  it('scopes order + payments queries by effective userId', async () => {
    const orderSingle = vi.fn().mockResolvedValue({
      data: { id: 'o1', order_items: [] },
      error: null,
    });
    const orderEq2 = vi.fn(() => ({ single: orderSingle }));
    const orderEq1 = vi.fn(() => ({ eq: orderEq2 }));
    const orderSelect = vi.fn(() => ({ eq: orderEq1 }));

    const paymentsOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const paymentsEq2 = vi.fn(() => ({ order: paymentsOrder }));
    const paymentsEq1 = vi.fn(() => ({ eq: paymentsEq2 }));
    const paymentsSelect = vi.fn(() => ({ eq: paymentsEq1 }));

    const from = vi.fn((table: string) => {
      if (table === 'orders') return { select: orderSelect };
      if (table === 'payments') return { select: paymentsSelect };
      return {};
    });

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET(
      new NextRequest('http://localhost/api/orders/o1'),
      makeParams('o1')
    );

    expect(res.status).toBe(200);
    expect(orderEq1).toHaveBeenCalledWith('id', 'o1');
    expect(orderEq2).toHaveBeenCalledWith('user_id', TARGET_ID);
    expect(paymentsEq2).toHaveBeenCalledWith('user_id', TARGET_ID);
    expect(cacheServiceMock.getOrderDetails).toHaveBeenCalledWith(TARGET_ID, 'o1');
  });

  function customerClient(row: Record<string, unknown>) {
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const orderSelect = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) }));
    const paymentsOrder = vi.fn().mockResolvedValue({ data: [{ id: 'pay-1' }], error: null });
    const paymentsSelect = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ order: paymentsOrder })) })) }));
    return {
      from: vi.fn((table: string) => (table === 'orders' ? { select: orderSelect } : { select: paymentsSelect })),
    };
  }

  it('never returns placed_by_admin_id to the customer; other fields remain (and it is not cached)', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      client: customerClient({
        id: 'o1',
        order_number: 'CB-0001',
        status: 'processing',
        total_amount: 1000,
        placed_by_admin_id: ADMIN_ID,
        order_items: [],
      }),
      sessionUser: { id: TARGET_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET(new NextRequest('http://localhost/api/orders/o1'), makeParams('o1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order).not.toHaveProperty('placed_by_admin_id');
    expect(JSON.stringify(body)).not.toContain(ADMIN_ID);
    expect(body.order).toMatchObject({ id: 'o1', order_number: 'CB-0001', status: 'processing', total_amount: 1000, items: [] });
    expect(body.payments).toEqual([{ id: 'pay-1' }]);
    const cached = cacheServiceMock.setOrderDetails.mock.calls[0]?.[2] as { order: object };
    expect(cached.order).not.toHaveProperty('placed_by_admin_id');
  });

  it('strips placed_by_admin_id from an order-details entry cached before the fix', async () => {
    cacheServiceMock.getOrderDetails.mockResolvedValue({
      data: { order: { id: 'o1', order_number: 'CB-0001', placed_by_admin_id: ADMIN_ID, items: [] }, payments: [] },
      ttl: 100,
      isStale: false,
    });
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      client: { from: vi.fn() },
      sessionUser: { id: TARGET_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET(new NextRequest('http://localhost/api/orders/o1'), makeParams('o1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache-Status')).toBe('HIT');
    const body = await res.json();
    expect(body.order).not.toHaveProperty('placed_by_admin_id');
    expect(body).toEqual({ order: { id: 'o1', order_number: 'CB-0001', items: [] }, payments: [] });
  });

  it('returns error response when getEffectiveUser fails with forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await GET(
      new NextRequest('http://localhost/api/orders/o1'),
      makeParams('o1')
    );
    expect(res.status).toBe(403);
    expect(effectiveUserErrorResponseMock).toHaveBeenCalled();
  });
});

describe('PATCH /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes update by effective userId', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'o1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const eqUser = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const update = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/orders/o1', {
        method: 'PATCH',
        body: JSON.stringify({ notes: 'hi' }),
      }),
      makeParams('o1')
    );

    expect(res.status).toBe(200);
    expect(eqId).toHaveBeenCalledWith('id', 'o1');
    expect(eqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
  });

  it('does not return placed_by_admin_id on the updated order', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'o1', notes: 'hi', placed_by_admin_id: ADMIN_ID },
      error: null,
    });
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) })) }));
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      client: { from: vi.fn(() => ({ update })) },
      sessionUser: { id: TARGET_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/orders/o1', { method: 'PATCH', body: JSON.stringify({ notes: 'hi' }) }),
      makeParams('o1')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: { id: 'o1', notes: 'hi' } });
  });

  it('returns error response when getEffectiveUser fails with forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await PATCH(
      new NextRequest('http://localhost/api/orders/o1', { method: 'PATCH', body: '{}' }),
      makeParams('o1')
    );
    expect(res.status).toBe(403);
  });
});
