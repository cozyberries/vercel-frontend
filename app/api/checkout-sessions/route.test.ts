import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  validateAndFetchAddressesMock,
  validateItemPricesMock,
  calculateOrderSummaryMock,
  applyAdminOverrideMock,
  validateAndApplyOfferMock,
  logServerEventMock,
  notifyCheckoutInitiatedMock,
  insertSessionMock,
  singleSessionMock,
  updatePendingEqStatusMock,
  fromMock,
  clientMock,
} = vi.hoisted(() => {
  const singleSessionMock = vi.fn();
  const selectSessionMock = vi.fn(() => ({ single: singleSessionMock }));
  const insertSessionMock = vi.fn(() => ({ select: selectSessionMock }));

  // update(...).eq('user_id').eq('status') — returns a promise-resolvable chain
  const updatePendingEqStatusMock = vi.fn().mockResolvedValue({ error: null });
  const updatePendingEqUserIdMock = vi.fn(() => ({
    eq: updatePendingEqStatusMock,
  }));
  const updateMock = vi.fn(() => ({ eq: updatePendingEqUserIdMock }));

  const insertEventLogsMock = vi.fn().mockResolvedValue({ error: null });

  const fromMock = vi.fn((table: string) => {
    if (table === 'checkout_sessions') {
      return { insert: insertSessionMock, update: updateMock };
    }
    if (table === 'event_logs') {
      return { insert: insertEventLogsMock };
    }
    return {};
  });

  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    validateAndFetchAddressesMock: vi.fn(),
    validateItemPricesMock: vi.fn(),
    calculateOrderSummaryMock: vi.fn(),
    applyAdminOverrideMock: vi.fn(),
    validateAndApplyOfferMock: vi.fn(),
    logServerEventMock: vi.fn().mockResolvedValue(undefined),
    notifyCheckoutInitiatedMock: vi.fn(),
    insertSessionMock,
    singleSessionMock,
    updatePendingEqStatusMock,
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
  applyAdminOverride: applyAdminOverrideMock,
}));

vi.mock('@/lib/utils/offers-server', () => ({
  validateAndApplyOffer: validateAndApplyOfferMock,
}));

vi.mock('@/lib/services/event-logger', () => ({
  logServerEvent: logServerEventMock,
}));

vi.mock('@/lib/services/telegram', () => ({
  notifyCheckoutInitiated: notifyCheckoutInitiatedMock,
}));

import { POST } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/checkout-sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseItems = [
  { id: 'p1', name: 'Prod', price: 1000, quantity: 1 },
];

function baseBody(extra: Record<string, unknown> = {}) {
  return {
    items: baseItems,
    shipping_address_id: 'addr-1',
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  calculateOrderSummaryMock.mockReturnValue({
    subtotal: 1000,
    delivery_charge: 0,
    tax_amount: 0,
    total_amount: 1000,
    currency: 'INR',
  });

  validateAndFetchAddressesMock.mockResolvedValue({
    data: {
      shippingAddress: { full_name: 'T', address_line_1: 'x', city: 'y', state: 'z', postal_code: '1', country: 'IN' },
      billingAddress: { full_name: 'T', address_line_1: 'x', city: 'y', state: 'z', postal_code: '1', country: 'IN' },
      shippingRow: { phone: '+910000000000' },
    },
  });
  validateItemPricesMock.mockResolvedValue(null);
  singleSessionMock.mockResolvedValue({
    data: { id: 'session-1' },
    error: null,
  });
});

describe('POST /api/checkout-sessions — non-shadow path (regression)', () => {
  it('creates a session using the customer\'s own email and sets placed_by_admin_id=null', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });

    const res = await POST(makeRequest(baseBody()));
    expect(res.status).toBe(200);

    expect(insertSessionMock).toHaveBeenCalledTimes(1);
    const inserted = (insertSessionMock.mock.calls[0] as any[])[0];
    expect(inserted.user_id).toBe(TARGET_ID);
    expect(inserted.customer_email).toBe('customer@example.com');
    expect(inserted.placed_by_admin_id).toBeNull();
    expect(applyAdminOverrideMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/checkout-sessions — shadow path without override', () => {
  it('persists placed_by_admin_id and uses the target email', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    const res = await POST(makeRequest(baseBody()));
    expect(res.status).toBe(200);

    const inserted = (insertSessionMock.mock.calls[0] as any[])[0];
    expect(inserted.user_id).toBe(TARGET_ID);
    expect(inserted.customer_email).toBe('target@example.com');
    expect(inserted.placed_by_admin_id).toBe(ADMIN_ID);

    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('admin@example.com');
  });
});

describe('POST /api/checkout-sessions — shadow path with override', () => {
  it('ignores coupon, applies override discount, recomputes delivery, prefixes notes', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    // Subtotal 1000, override 300 → discounted subtotal 700 < FREE_DELIVERY_THRESHOLD (1000)
    calculateOrderSummaryMock.mockReturnValue({
      subtotal: 1000,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
    });

    applyAdminOverrideMock.mockReturnValue({
      ok: true,
      discountCode: 'ADMIN_OVERRIDE',
      discountAmount: 300,
      notes: '[ADMIN OVERRIDE by admin@example.com]: wholesale',
    });

    const body = baseBody({
      coupon_code: 'SHOULD_BE_IGNORED',
      admin_override: { discount_amount: 300, note: 'wholesale' },
    });

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    expect(applyAdminOverrideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        override: { discount_amount: 300, note: 'wholesale' },
        subtotal: 1000,
        actingAdminEmail: 'admin@example.com',
      })
    );
    expect(validateAndApplyOfferMock).not.toHaveBeenCalled();

    const inserted = (insertSessionMock.mock.calls[0] as any[])[0];
    expect(inserted.discount_code).toBe('ADMIN_OVERRIDE');
    expect(inserted.discount_amount).toBe(300);
    expect(inserted.notes).toBe('[ADMIN OVERRIDE by admin@example.com]: wholesale');
    expect(inserted.placed_by_admin_id).toBe(ADMIN_ID);
    // delivery charge applied because discounted subtotal < threshold
    expect(inserted.delivery_charge).toBeGreaterThan(0);
    expect(inserted.total_amount).toBe(
      1000 - 300 + inserted.delivery_charge
    );

    // admin_override_applied server-event was emitted
    expect(logServerEventMock).toHaveBeenCalledWith(
      clientMock,
      TARGET_ID,
      'admin_override_applied',
      expect.objectContaining({
        session_id: 'session-1',
        discount_amount: 300,
        actor_id: ADMIN_ID,
      })
    );
  });

  it('returns 400 when applyAdminOverride rejects the note', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    applyAdminOverrideMock.mockReturnValue({
      ok: false,
      error: 'Override reason must be at least 3 characters',
    });

    const res = await POST(
      makeRequest(baseBody({ admin_override: { discount_amount: 50, note: '' } }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Override reason/);
  });
});

describe('POST /api/checkout-sessions — non-shadow with admin_override in body', () => {
  it('returns 403', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });

    const res = await POST(
      makeRequest(
        baseBody({ admin_override: { discount_amount: 100, note: 'sneaky' } })
      )
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Admin override not allowed/);
    expect(insertSessionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/checkout-sessions — auth failures', () => {
  it('delegates to effectiveUserErrorResponse on getEffectiveUser failure', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
      clearCookie: false,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const res = await POST(makeRequest(baseBody()));
    expect(res.status).toBe(401);
    expect(effectiveUserErrorResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, reason: 'unauthenticated' }),
      expect.objectContaining({ unauthenticatedMessage: 'Authentication required' })
    );
  });
});
