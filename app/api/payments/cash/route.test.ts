import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000002';

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const calls: Record<string, any[]> = {};
  const reset = () => {
    Object.assign(state, {
      order: {
        id: 'order-1', order_number: 'ORD-1', status: 'payment_pending', total_amount: 1050, currency: 'INR',
        subtotal: 1050, delivery_charge: 0, discount_code: null, discount_amount: 0, customer_email: 'a@b.c',
        customer_phone: '9876543210', customer_name: 'Asha Rao', fulfilment_method: 'pickup', shipping_address: null,
        order_items: [{ name: 'Frock', quantity: 1, size: '3-4Y' }],
      },
      paymentInsert: { data: { id: 'pay-1' }, error: null },
      move: { data: [{ id: 'order-1' }], error: null },
    });
    calls.paymentInserts = [];
    calls.orderUpdates = [];
    calls.paymentDeletes = [];
    calls.paymentDeleteEqs = [];
    calls.events = [];
  };
  reset();
  const client = {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: state.order, error: state.order ? null : { code: 'PGRST116' } }) }) }) }),
          update: (values: unknown) => {
            calls.orderUpdates.push(values);
            return { eq: () => ({ eq: () => ({ select: async () => state.move }) }) };
          },
        };
      }
      if (table === 'payments') {
        return {
          insert: (values: unknown) => {
            calls.paymentInserts.push(values);
            return { select: () => ({ single: async () => state.paymentInsert }) };
          },
          delete: () => {
            const eqs: [string, unknown][] = [];
            calls.paymentDeleteEqs.push(eqs);
            const chain: any = {
              eq: (col: string, val: unknown) => {
                eqs.push([col, val]);
                if (col === 'id') calls.paymentDeletes.push(val);
                return chain;
              },
              then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve({ error: null }).then(resolve, reject),
            };
            return chain;
          },
        };
      }
      return { insert: async (values: unknown) => { calls.events.push(values); return { error: null }; } };
    },
  };
  return { state, calls, reset, client, getEffectiveUser: vi.fn(), notifyNewOrder: vi.fn() };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: h.getEffectiveUser,
  effectiveUserErrorResponse: vi.fn(async () => new Response(null, { status: 401 })),
}));
vi.mock('@/lib/services/telegram', () => ({ notifyNewOrder: h.notifyNewOrder }));

// `after()` keeps the function alive until the Telegram send settles. Run the
// callback inline so the notifyNewOrder assertions still see the call.
const afterMock = vi.hoisted(() => vi.fn((run: () => unknown) => run()));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: afterMock,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/payments/cash', { method: 'POST', body: JSON.stringify(body) });

const asStaff = () =>
  h.getEffectiveUser.mockResolvedValue({
    ok: true, userId: CUSTOMER_ID, actingAdminId: ADMIN_ID, client: h.client,
    sessionUser: { id: ADMIN_ID, email: 'staff@cozyberries.in' }, effectiveUser: { id: CUSTOMER_ID },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
});

describe('POST /api/payments/cash', () => {
  it('is refused for a customer session (no acting admin)', async () => {
    h.getEffectiveUser.mockResolvedValue({
      ok: true, userId: CUSTOMER_ID, actingAdminId: null, client: h.client,
      sessionUser: { id: CUSTOMER_ID }, effectiveUser: { id: CUSTOMER_ID },
    });
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(403);
    expect(h.calls.paymentInserts).toHaveLength(0);
  });

  it('returns 404 for an order that is not this customer\'s', async () => {
    asStaff();
    h.state.order = null;
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when the order is not awaiting payment', async () => {
    asStaff();
    h.state.order.status = 'processing';
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(409);
    expect(h.calls.paymentInserts).toHaveLength(0);
  });

  it('records a processing cash payment, moves the order to verifying, audits, and asks Telegram to confirm', async () => {
    asStaff();
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'verifying_payment' });
    expect(h.calls.paymentInserts[0]).toMatchObject({
      order_id: 'order-1', user_id: CUSTOMER_ID, payment_method: 'cash', gateway_provider: 'manual',
      status: 'processing', amount: 1050,
    });
    expect(h.calls.orderUpdates[0]).toEqual({ status: 'verifying_payment' });
    expect(h.calls.events[0]).toEqual({
      order_id: 'order-1', from_status: 'payment_pending', to_status: 'verifying_payment', actor_admin_id: ADMIN_ID,
    });
    expect(h.notifyNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', paymentMethod: 'cash', fulfilmentMethod: 'pickup', placedByEmail: 'staff@cozyberries.in' }),
      expect.objectContaining({ header: expect.stringContaining('Cash received') })
    );
  });

  it('sends the confirm-payment message through after() so it outlives the response', async () => {
    asStaff();
    const sent = Promise.resolve();
    h.notifyNewOrder.mockReturnValueOnce(sent);
    await POST(req({ orderId: 'order-1' }));
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(afterMock.mock.results[0].value).toBe(sent);
  });

  it('removes the payment again when the order moved on concurrently', async () => {
    asStaff();
    h.state.move = { data: [], error: null };
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(409);
    expect(h.calls.paymentDeletes).toEqual(['pay-1']);
    expect(h.notifyNewOrder).not.toHaveBeenCalled();
  });

  it('only removes the payment while it is still processing, never one the webhook completed', async () => {
    asStaff();
    h.state.move = { data: [], error: null };
    await POST(req({ orderId: 'order-1' }));
    expect(h.calls.paymentDeleteEqs).toEqual([[['id', 'pay-1'], ['status', 'processing']]]);
  });

  it('refuses to record cash for a fully discounted order', async () => {
    asStaff();
    h.state.order.total_amount = 0;
    const res = await POST(req({ orderId: 'order-1' }));
    expect(res.status).toBe(400);
    expect(h.calls.paymentInserts).toHaveLength(0);
  });
});
