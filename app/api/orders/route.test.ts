import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  validateAndFetchAddressesMock,
  validateItemPricesMock,
  calculateOrderSummaryMock,
  validateAndApplyOfferMock,
  notifyAdminsOrderPlacedFromCheckoutMock,
  notifyOrderPlacedMock,
  insertOrdersMock,
  insertItemsMock,
  selectOrdersMock,
  singleOrdersMock,
  fromMock,
  clientMock,
} = vi.hoisted(() => {
  const singleOrdersMock = vi.fn();
  const selectOrdersMock = vi.fn(() => ({ single: singleOrdersMock }));
  const insertOrdersMock = vi.fn(() => ({ select: selectOrdersMock }));
  const insertItemsMock = vi.fn();
  const deleteOrdersMock = vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) }));

  const rangeMock = vi.fn();
  const orderRangeChain = vi.fn(() => ({ range: rangeMock }));
  const eqUserIdMock = vi.fn(() => ({ order: orderRangeChain }));
  const selectAllMock = vi.fn(() => ({ eq: eqUserIdMock }));

  const fromMock = vi.fn((table: string) => {
    if (table === 'orders') {
      return {
        insert: insertOrdersMock,
        select: selectAllMock,
        delete: deleteOrdersMock,
      };
    }
    if (table === 'order_items') {
      return { insert: insertItemsMock };
    }
    return {};
  });

  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    validateAndFetchAddressesMock: vi.fn(),
    validateItemPricesMock: vi.fn(),
    calculateOrderSummaryMock: vi.fn(),
    validateAndApplyOfferMock: vi.fn(),
    notifyAdminsOrderPlacedFromCheckoutMock: vi.fn(),
    notifyOrderPlacedMock: vi.fn(),
    insertOrdersMock,
    insertItemsMock,
    selectOrdersMock,
    singleOrdersMock,
    fromMock,
    clientMock: { from: fromMock },
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/utils/checkout-helpers', () => ({
  validateAndFetchAddresses: validateAndFetchAddressesMock,
  validateItemPrices: validateItemPricesMock,
  calculateOrderSummary: calculateOrderSummaryMock,
}));

vi.mock('@/lib/utils/offers-server', () => ({
  validateAndApplyOffer: validateAndApplyOfferMock,
}));

vi.mock('@/lib/services/admin-order-notifications', () => ({
  notifyAdminsOrderPlacedFromCheckout: notifyAdminsOrderPlacedFromCheckoutMock,
}));

vi.mock('@/lib/services/telegram', () => ({
  notifyOrderPlaced: notifyOrderPlacedMock,
}));

import { POST, GET } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calculateOrderSummaryMock.mockReturnValue({
      subtotal: 1000,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
    });
    validateAndFetchAddressesMock.mockResolvedValue({
      data: {
        shippingAddress: { full_name: 'Target User', address_line_1: 'x', city: 'y', state: 'z', postal_code: '1', country: 'IN' },
        billingAddress: { full_name: 'Target User', address_line_1: 'x', city: 'y', state: 'z', postal_code: '1', country: 'IN' },
        shippingRow: { phone: '+910000000000' },
      },
    });
    validateItemPricesMock.mockResolvedValue(null);
    singleOrdersMock.mockResolvedValue({
      data: {
        id: 'order-1',
        order_number: 'CB-0001',
        status: 'payment_pending',
        total_amount: 1000,
        currency: 'INR',
      },
      error: null,
    });
    insertItemsMock.mockResolvedValue({ error: null });
  });

  it('uses effective userId and actingAdminId when impersonating', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    const req = makeRequest({
      items: [{ id: 'p1', name: 'Prod', price: 1000, quantity: 1 }],
      shipping_address_id: 'addr-1',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(validateAndFetchAddressesMock).toHaveBeenCalledWith(
      clientMock,
      TARGET_ID,
      'addr-1',
      undefined
    );
    expect(validateItemPricesMock).toHaveBeenCalledWith(clientMock, expect.any(Array));

    expect(fromMock).toHaveBeenCalledWith('orders');
    expect(insertOrdersMock).toHaveBeenCalledTimes(1);
    const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
    expect(inserted.user_id).toBe(TARGET_ID);
    expect(inserted.placed_by_admin_id).toBe(ADMIN_ID);
    expect(inserted.customer_email).toBe('target@example.com');
  });

  it('returns error response via helper when getEffectiveUser rejects with forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await POST(makeRequest());
    expect(effectiveUserErrorResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, reason: 'forbidden_not_admin' }),
      expect.objectContaining({ unauthenticatedMessage: 'Authentication required' })
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters orders by effective userId when impersonating', async () => {
    const rangeResult = { data: [], error: null };
    const orderChain = vi.fn(() => ({ range: vi.fn().mockResolvedValue(rangeResult) }));
    const eqChain = vi.fn(() => ({ order: orderChain }));
    const selectChain = vi.fn(() => ({ eq: eqChain }));
    const localFrom = vi.fn(() => ({ select: selectChain }));
    const localClient = { from: localFrom };

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: localClient,
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const req = new NextRequest('http://localhost/api/orders?limit=10&offset=0');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(localFrom).toHaveBeenCalledWith('orders');
    expect(eqChain).toHaveBeenCalledWith('user_id', TARGET_ID);
  });

  it('returns error response when getEffectiveUser rejects with forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await GET(new NextRequest('http://localhost/api/orders'));
    expect(res.status).toBe(403);
    expect(effectiveUserErrorResponseMock).toHaveBeenCalled();
  });
});
