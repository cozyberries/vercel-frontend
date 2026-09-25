import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const calls: Record<string, any[]> = {};
  const reset = () => {
    Object.assign(state, {
      order: { id: 'order-1', status: 'payment_pending', user_id: 'user-1', total_amount: 1050, currency: 'INR' },
      loadError: null,
      confirm: { data: [{ id: 'order-1', invoice_number: 'CB/26-27/0001' }], error: null },
      paymentUpdate: { data: [], error: null },
      paymentInsert: { error: null },
      revert: { error: null },
    });
    calls.orderUpdates = [];
    calls.orderEqs = [];
    calls.paymentUpdates = [];
    calls.paymentInserts = [];
  };
  reset();

  const ordersTable = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: state.order, error: state.loadError }),
        single: async () => ({
          data: { ...state.order, order_number: 'ORD-1', customer_email: 'a@b.c', order_items: [] },
          error: null,
        }),
      }),
    }),
    update: (values: unknown) => {
      calls.orderUpdates.push(values);
      const eqs: unknown[] = [];
      calls.orderEqs.push(eqs);
      const chain: any = {
        eq: (col: string, val: unknown) => {
          eqs.push([col, val]);
          return chain;
        },
        select: async () => state.confirm,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(state.revert).then(resolve, reject),
      };
      return chain;
    },
  });

  const paymentsTable = () => ({
    update: (values: unknown) => {
      calls.paymentUpdates.push(values);
      const chain: any = { eq: () => chain, in: () => chain, select: async () => state.paymentUpdate };
      return chain;
    },
    insert: async (values: unknown) => {
      calls.paymentInserts.push(values);
      return state.paymentInsert;
    },
  });

  return {
    state,
    calls,
    reset,
    client: { from: (table: string) => (table === 'orders' ? ordersTable() : paymentsTable()) },
    answerCallbackQuery: vi.fn(async () => {}),
    editTelegramMessage: vi.fn(async () => {}),
    buildNewOrderText: vi.fn(() => 'text'),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.client }));
vi.mock('@/lib/services/telegram', () => ({
  answerCallbackQuery: h.answerCallbackQuery,
  editTelegramMessage: h.editTelegramMessage,
  buildNewOrderText: h.buildNewOrderText,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function tap(secret = 's3cret', data = 'confirm_payment:order-1') {
  return new NextRequest('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret, 'content-type': 'application/json' },
    body: JSON.stringify({
      callback_query: {
        id: 'cb-1',
        from: { username: 'owner', first_name: 'Owner' },
        message: { message_id: 7, chat: { id: 42 } },
        data,
      },
    }),
  });
}

const lastAnswer = () => (h.answerCallbackQuery.mock.calls.at(-1) as unknown[] | undefined)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 's3cret');
});

describe('POST /api/telegram/webhook — confirm payment', () => {
  it('rejects a request without the webhook secret', async () => {
    const res = await POST(tap('wrong'));
    expect(res.status).toBe(401);
    expect(h.calls.orderUpdates).toHaveLength(0);
  });

  it('confirms a payment_pending order and records the missing UPI payment', async () => {
    await POST(tap());
    expect(h.calls.orderUpdates[0]).toEqual({ status: 'processing' });
    expect(h.calls.orderEqs[0]).toEqual([['id', 'order-1'], ['status', 'payment_pending']]);
    expect(h.calls.paymentInserts).toHaveLength(1);
    expect(h.calls.paymentInserts[0]).toMatchObject({
      order_id: 'order-1',
      user_id: 'user-1',
      payment_method: 'upi',
      gateway_provider: 'manual',
      status: 'completed',
      amount: 1050,
    });
    expect(lastAnswer()).toBe('✅ Payment confirmed · CB/26-27/0001');
    expect(h.editTelegramMessage).toHaveBeenCalledWith(42, 7, expect.stringContaining('Confirmed by @owner'));
  });

  it('completes an existing cash payment instead of inserting a new one', async () => {
    h.state.order.status = 'verifying_payment';
    h.state.paymentUpdate = { data: [{ id: 'pay-1' }], error: null };
    await POST(tap());
    expect(h.calls.orderEqs[0]).toContainEqual(['status', 'verifying_payment']);
    expect(h.calls.paymentUpdates[0]).toEqual({ status: 'completed' });
    expect(h.calls.paymentInserts).toHaveLength(0);
  });

  it('replies out of stock and writes no payment when the trigger refuses', async () => {
    h.state.confirm = { data: null, error: { code: 'P0001', message: 'OUT_OF_STOCK:Frock 3-4Y' } };
    await POST(tap());
    expect(lastAnswer()).toBe('❌ Out of stock: Frock 3-4Y');
    expect(h.calls.paymentUpdates).toHaveLength(0);
    expect(h.calls.paymentInserts).toHaveLength(0);
  });

  it('does nothing for an order that is no longer awaiting payment (e.g. cancelled)', async () => {
    h.state.order.status = 'cancelled';
    await POST(tap());
    expect(h.calls.orderUpdates).toHaveLength(0);
    expect(lastAnswer()).toBe('⚠️ Already confirmed or not found');
  });

  it('reverts the order to its previous status when the payment write fails', async () => {
    h.state.paymentInsert = { error: { message: 'boom' } };
    await POST(tap());
    expect(h.calls.orderUpdates).toEqual([{ status: 'processing' }, { status: 'payment_pending' }]);
    expect(h.calls.orderEqs[1]).toEqual([['id', 'order-1'], ['status', 'processing']]);
    expect(lastAnswer()).toBe('❌ Payment update failed — please retry');
  });

  it('confirms a fully discounted order without writing a zero-amount payment', async () => {
    h.state.order.total_amount = 0;
    await POST(tap());
    expect(h.calls.orderUpdates[0]).toEqual({ status: 'processing' });
    expect(h.calls.paymentUpdates).toHaveLength(0);
    expect(h.calls.paymentInserts).toHaveLength(0);
    expect(lastAnswer()).toBe('✅ Payment confirmed · CB/26-27/0001');
  });
});
