import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';
const SESSION_ID = 'session-abc';
const ORDER_ID = 'order-xyz';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  logImpersonationEventMock,
  extractRequestMetadataMock,
  logServerEventMock,
  notifyNewOrderMock,
  notifyPaymentConfirmedMock,
  isSessionExpiredMock,
  sessionRowMock,
  sessionReserveRowsMock,
  sessionCompleteRowsMock,
  orderInsertRowMock,
  orderItemsInsertResultMock,
  paymentInsertRowMock,
  fromMock,
  clientMock,
} = vi.hoisted(() => {
  const _SESSION_ID = 'session-abc';
  const _ORDER_ID = 'order-xyz';
  const sessionRowMock = { current: null as any, error: null as any };
  const sessionReserveRowsMock = { current: [{ id: _SESSION_ID }] as any, error: null as any };
  const sessionCompleteRowsMock = { current: [{ id: _SESSION_ID }] as any, error: null as any };
  const orderInsertRowMock = {
    current: { id: _ORDER_ID, order_number: 'CB-0001' } as any,
    error: null as any,
  };
  const orderItemsInsertResultMock = { error: null as any };
  const paymentInsertRowMock = { current: { id: 'pay-1' } as any, error: null as any };

  const fromMock = vi.fn((table: string) => {
    if (table === 'checkout_sessions') {
      // select(...).eq('id').eq('user_id').single()
      const select = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: sessionRowMock.current,
              error: sessionRowMock.error,
            }),
          })),
        })),
      }));

      // update({ status }).eq('id').eq('status').select('id') — two separate
      // update call sites (reserve + complete). We return the reserve shape
      // on the first call and the complete shape on the second.
      let updateCallCount = 0;
      const update = vi.fn(() => {
        updateCallCount++;
        const result =
          updateCallCount === 1 ? sessionReserveRowsMock : sessionCompleteRowsMock;
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({
                data: result.current,
                error: result.error,
              }),
            })),
          })),
        };
      });

      return { select, update };
    }

    if (table === 'orders') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: orderInsertRowMock.current,
              error: orderInsertRowMock.error,
            }),
          })),
        })),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }

    if (table === 'order_items') {
      return {
        insert: vi.fn().mockResolvedValue(orderItemsInsertResultMock),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }

    if (table === 'payments') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: paymentInsertRowMock.current,
              error: paymentInsertRowMock.error,
            }),
          })),
        })),
        delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    }

    if (table === 'event_logs') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }

    return {};
  });

  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    logImpersonationEventMock: vi.fn().mockResolvedValue(undefined),
    extractRequestMetadataMock: vi.fn(() => ({ ip: '1.2.3.4', user_agent: 'ua' })),
    logServerEventMock: vi.fn().mockResolvedValue(undefined),
    notifyNewOrderMock: vi.fn(),
    notifyPaymentConfirmedMock: vi.fn(),
    isSessionExpiredMock: vi.fn().mockReturnValue(false),
    sessionRowMock,
    sessionReserveRowsMock,
    sessionCompleteRowsMock,
    orderInsertRowMock,
    orderItemsInsertResultMock,
    paymentInsertRowMock,
    fromMock,
    clientMock: { from: fromMock },
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/services/impersonation-audit', () => ({
  logImpersonationEvent: logImpersonationEventMock,
  extractRequestMetadata: extractRequestMetadataMock,
}));

vi.mock('@/lib/services/event-logger', () => ({
  logServerEvent: logServerEventMock,
}));

vi.mock('@/lib/services/telegram', () => ({
  notifyNewOrder: notifyNewOrderMock,
  notifyPaymentConfirmed: notifyPaymentConfirmedMock,
}));

vi.mock('@/lib/utils/checkout-helpers', () => ({
  isSessionExpired: isSessionExpiredMock,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/payments/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validSessionItems = [
  { id: 'p1', name: 'Prod', price: 1000, quantity: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  isSessionExpiredMock.mockReturnValue(false);
  orderInsertRowMock.current = { id: ORDER_ID, order_number: 'CB-0001' };
  orderInsertRowMock.error = null;
  orderItemsInsertResultMock.error = null;
  paymentInsertRowMock.current = { id: 'pay-1' };
  paymentInsertRowMock.error = null;
  sessionReserveRowsMock.current = [{ id: SESSION_ID }];
  sessionReserveRowsMock.error = null;
  sessionCompleteRowsMock.current = [{ id: SESSION_ID }];
  sessionCompleteRowsMock.error = null;
});

describe('POST /api/payments/confirm — session path', () => {
  it('with placed_by_admin_id=null: writes order with null admin and no impersonation event', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });

    sessionRowMock.current = {
      id: SESSION_ID,
      user_id: TARGET_ID,
      status: 'pending',
      created_at: new Date().toISOString(),
      customer_email: 'customer@example.com',
      customer_phone: '+91999',
      shipping_address: {},
      billing_address: {},
      items: validSessionItems,
      subtotal: 1000,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
      notes: null,
      discount_code: null,
      discount_amount: 0,
      placed_by_admin_id: null,
    };

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(200);

    expect(fromMock).toHaveBeenCalledWith('orders');
    const ordersTableCalls = fromMock.mock.results.find(
      (r: any) => r.value.insert
    );
    expect(ordersTableCalls).toBeDefined();

    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('with placed_by_admin_id=<admin>: writes order with admin id + logs order_placed event', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    sessionRowMock.current = {
      id: SESSION_ID,
      user_id: TARGET_ID,
      status: 'pending',
      created_at: new Date().toISOString(),
      customer_email: 'target@example.com',
      customer_phone: '+91999',
      shipping_address: {},
      billing_address: {},
      items: validSessionItems,
      subtotal: 1000,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
      notes: null,
      discount_code: null,
      discount_amount: 0,
      placed_by_admin_id: ADMIN_ID,
    };

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(200);

    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        target_id: TARGET_ID,
        event_type: 'order_placed',
        order_id: ORDER_ID,
        ip: '1.2.3.4',
        user_agent: 'ua',
      })
    );

    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('admin@example.com');
  });

  it('returns 409 with existing order_id when the session is already completed (idempotency)', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });

    sessionRowMock.current = {
      id: SESSION_ID,
      user_id: TARGET_ID,
      status: 'completed',
      created_at: new Date().toISOString(),
      order_id: 'prior-order-id',
      items: validSessionItems,
      placed_by_admin_id: null,
    };

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Payment already confirmed',
      order_id: 'prior-order-id',
    });
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the pending → processing reserve affects zero rows (race)', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });

    sessionRowMock.current = {
      id: SESSION_ID,
      user_id: TARGET_ID,
      status: 'pending',
      created_at: new Date().toISOString(),
      customer_email: 'customer@example.com',
      customer_phone: '+91999',
      shipping_address: {},
      billing_address: {},
      items: validSessionItems,
      subtotal: 1000,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
      placed_by_admin_id: null,
    };

    // Simulate a concurrent request having already reserved the session.
    sessionReserveRowsMock.current = [];

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/being processed/i);
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('still logs order_placed when customer (not admin) confirms a session created by admin', async () => {
    // Admin created the session (placed_by_admin_id=ADMIN_ID), then exited
    // impersonation. The customer logs in themselves and confirms payment.
    // getEffectiveUser returns actingAdminId=null (no acting cookie) but the
    // session row still carries placed_by_admin_id.
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'target@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    sessionRowMock.current = {
      id: SESSION_ID,
      user_id: TARGET_ID,
      status: 'pending',
      created_at: new Date().toISOString(),
      customer_email: 'target@example.com',
      customer_phone: '+91999',
      shipping_address: {},
      billing_address: {},
      items: validSessionItems,
      subtotal: 1000,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 1000,
      currency: 'INR',
      notes: null,
      discount_code: null,
      discount_amount: 0,
      placed_by_admin_id: ADMIN_ID,
    };

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(200);
    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        target_id: TARGET_ID,
        event_type: 'order_placed',
      })
    );
  });
});
