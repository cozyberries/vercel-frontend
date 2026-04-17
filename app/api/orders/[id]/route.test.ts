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
