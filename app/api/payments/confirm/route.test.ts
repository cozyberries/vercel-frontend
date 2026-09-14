import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  createAdminSupabaseClientMock,
  adminFromMock,
  adminOrderItemsDelete,
  adminOrderItemsDeleteEq,
  adminOrdersDelete,
  adminOrdersDeleteEq,
  adminPaymentsDelete,
  adminPaymentsDeleteEq,
  sessionOrderItemsDelete,
  sessionOrdersDelete,
  sessionPaymentsDelete,
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

  // Session (user-scoped) client's delete spies — the rollback paths must
  // NEVER reach these; deletes are privileged and must go through the admin
  // client spies below instead.
  const sessionOrderItemsDelete = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const sessionOrdersDelete = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const sessionPaymentsDelete = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

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
        delete: sessionOrdersDelete,
      };
    }

    if (table === 'order_items') {
      return {
        insert: vi.fn().mockResolvedValue(orderItemsInsertResultMock),
        delete: sessionOrderItemsDelete,
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
        delete: sessionPaymentsDelete,
      };
    }

    if (table === 'event_logs') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    }

    return {};
  });

  // Admin (service-role) client's delete spies — this is where the
  // compensating-delete rollback paths must land instead.
  const adminOrderItemsDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const adminOrderItemsDelete = vi.fn(() => ({ eq: adminOrderItemsDeleteEq }));
  const adminOrdersDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const adminOrdersDelete = vi.fn(() => ({ eq: adminOrdersDeleteEq }));
  const adminPaymentsDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const adminPaymentsDelete = vi.fn(() => ({ eq: adminPaymentsDeleteEq }));

  const adminFromMock = vi.fn((table: string) => {
    if (table === 'order_items') return { delete: adminOrderItemsDelete };
    if (table === 'orders') return { delete: adminOrdersDelete };
    if (table === 'payments') return { delete: adminPaymentsDelete };
    return {};
  });

  const createAdminSupabaseClientMock = vi.fn(() => ({ from: adminFromMock }));

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
    createAdminSupabaseClientMock,
    adminFromMock,
    adminOrderItemsDelete,
    adminOrderItemsDeleteEq,
    adminOrdersDelete,
    adminOrdersDeleteEq,
    adminPaymentsDelete,
    adminPaymentsDeleteEq,
    sessionOrderItemsDelete,
    sessionOrdersDelete,
    sessionPaymentsDelete,
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

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
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

describe('POST /api/payments/confirm — compensating-delete rollback routes through the admin client', () => {
  // `authenticated` no longer has DELETE on orders/order_items/payments
  // (deny-by-default RLS remediation). These rollbacks are privileged cleanup,
  // not a user action, so they must always go through the service-role
  // (admin) client — never the caller's session client, which no longer has
  // the grant and would fail (or silently no-op) under RLS.

  // A couple of tests below need fine-grained control over the shape returned
  // by successive `.from('checkout_sessions').update(...)` calls (reserve vs.
  // complete), so they replace `fromMock`'s implementation outright. Restore
  // the shared default afterward so later tests in this file are unaffected.
  const originalFromImpl = fromMock.getMockImplementation();

  function baseSession() {
    return {
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
  }

  beforeEach(() => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: null,
      client: clientMock,
      sessionUser: { id: TARGET_ID, email: 'customer@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'customer@example.com' },
    });
  });

  afterEach(() => {
    if (originalFromImpl) fromMock.mockImplementation(originalFromImpl);
  });

  it('rolls back order_items + orders through the admin client when the order_items insert fails', async () => {
    sessionRowMock.current = baseSession();
    orderItemsInsertResultMock.error = { message: 'insert failed' };

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(500);

    // Admin client used for the compensating deletes...
    expect(createAdminSupabaseClientMock).toHaveBeenCalled();
    expect(adminFromMock).toHaveBeenCalledWith('order_items');
    expect(adminOrderItemsDeleteEq).toHaveBeenCalledWith('order_id', ORDER_ID);
    expect(adminFromMock).toHaveBeenCalledWith('orders');
    expect(adminOrdersDeleteEq).toHaveBeenCalledWith('id', ORDER_ID);
    // No payment existed yet at this failure point — must not touch payments.
    expect(adminPaymentsDelete).not.toHaveBeenCalled();

    // ...and never through the user's session client.
    expect(sessionOrderItemsDelete).not.toHaveBeenCalled();
    expect(sessionOrdersDelete).not.toHaveBeenCalled();
  });

  it('rolls back order_items + orders + the orphaned payment through the admin client when the post-payment session update fails', async () => {
    sessionRowMock.current = baseSession();

    // Full custom fromMock for this test: the reserve update (1st call)
    // succeeds, the completion update (2nd call) affects 0 rows — simulating
    // a lost race on the pending->processing->completed transition — which
    // must trigger the rollbackOrder(order.id, paymentId) path.
    let checkoutSessionUpdateCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'checkout_sessions') {
        const select = vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: sessionRowMock.current,
                error: null,
              }),
            })),
          })),
        }));
        const update = vi.fn(() => {
          checkoutSessionUpdateCalls++;
          const isReserveCall = checkoutSessionUpdateCalls === 1;
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn().mockResolvedValue(
                  isReserveCall
                    ? { data: [{ id: SESSION_ID }], error: null }
                    : { data: [], error: null }
                ),
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
                error: null,
              }),
            })),
          })),
          delete: sessionOrdersDelete,
        };
      }
      if (table === 'order_items') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: sessionOrderItemsDelete,
        };
      }
      if (table === 'payments') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'pay-1' },
                error: null,
              }),
            })),
          })),
          delete: sessionPaymentsDelete,
        };
      }
      if (table === 'event_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ sessionId: SESSION_ID }));
    expect(res.status).toBe(500);

    expect(createAdminSupabaseClientMock).toHaveBeenCalled();
    expect(adminFromMock).toHaveBeenCalledWith('order_items');
    expect(adminOrderItemsDeleteEq).toHaveBeenCalledWith('order_id', ORDER_ID);
    expect(adminFromMock).toHaveBeenCalledWith('orders');
    expect(adminOrdersDeleteEq).toHaveBeenCalledWith('id', ORDER_ID);
    expect(adminFromMock).toHaveBeenCalledWith('payments');
    expect(adminPaymentsDeleteEq).toHaveBeenCalledWith('id', 'pay-1');

    expect(sessionOrderItemsDelete).not.toHaveBeenCalled();
    expect(sessionOrdersDelete).not.toHaveBeenCalled();
    expect(sessionPaymentsDelete).not.toHaveBeenCalled();
  });

  it('rolls back the orphaned payment through the admin client in the legacy order-based confirm flow', async () => {
    // Legacy flow: order already exists (payment_pending); payment insert
    // succeeds but the order status update affects 0 rows, so the newly
    // inserted payment must be deleted as an orphan.
    fromMock.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: ORDER_ID,
                    order_number: 'CB-0001',
                    status: 'payment_pending',
                    total_amount: 1000,
                    currency: 'INR',
                    customer_email: 'customer@example.com',
                    customer_phone: '+91999',
                  },
                  error: null,
                }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
          delete: sessionOrdersDelete,
        };
      }
      if (table === 'payments') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'pay-legacy-1' },
                error: null,
              }),
            })),
          })),
          delete: sessionPaymentsDelete,
        };
      }
      if (table === 'event_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ orderId: ORDER_ID }));
    expect(res.status).toBe(409);

    expect(createAdminSupabaseClientMock).toHaveBeenCalled();
    expect(adminFromMock).toHaveBeenCalledWith('payments');
    expect(adminPaymentsDeleteEq).toHaveBeenCalledWith('id', 'pay-legacy-1');
    expect(sessionPaymentsDelete).not.toHaveBeenCalled();
  });
});
