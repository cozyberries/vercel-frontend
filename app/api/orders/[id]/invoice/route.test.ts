import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: Record<string, any> = { order: null, error: null };
  const eqs: unknown[][] = [];
  const client = {
    from: () => ({
      select: () => {
        const chain: any = {
          eq: (col: string, val: unknown) => {
            eqs.push([col, val]);
            return chain;
          },
          maybeSingle: async () => ({ data: state.order, error: state.error }),
        };
        return chain;
      },
    }),
  };
  return { state, eqs, client, getEffectiveUser: vi.fn() };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: h.getEffectiveUser,
  effectiveUserErrorResponse: vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

const call = () =>
  GET(new NextRequest('http://localhost/api/orders/order-1/invoice'), { params: Promise.resolve({ id: 'order-1' }) });

const paidPickup = {
  id: 'order-1', order_number: 'ORD-1', created_at: '2026-09-25T06:00:00Z', status: 'processing',
  fulfilment_method: 'pickup', customer_name: 'Asha', customer_email: 'a@b.c', customer_phone: '9876543210',
  shipping_address: null, place_of_supply: '29', invoice_number: 'CB/26-27/0001', invoice_date: '2026-09-25T06:05:00Z',
  subtotal: 1050, discount_amount: 0, delivery_charge: 0, total_amount: 1050,
  order_items: [{ name: 'Frock', size: '3-4Y', color: null, price: 1050, quantity: 1 }],
  payments: [{ payment_method: 'upi', status: 'completed' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.eqs.length = 0;
  h.state.order = paidPickup;
  h.state.error = null;
  vi.stubEnv('BUSINESS_GSTIN', '29EPDPR9174E1ZB');
  h.getEffectiveUser.mockResolvedValue({ ok: true, userId: 'user-1', client: h.client });
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/orders/[id]/invoice', () => {
  it('passes through an unauthenticated caller', async () => {
    h.getEffectiveUser.mockResolvedValue({ ok: false, status: 401, reason: 'unauthenticated', clearCookie: false });
    expect((await call()).status).toBe(401);
  });

  it('scopes the lookup to the caller and 404s for someone else\'s order', async () => {
    h.state.order = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.eqs).toContainEqual(['user_id', 'user-1']);
  });

  it('returns the issued invoice', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const { invoice } = await res.json();
    expect(invoice).toMatchObject({ status: 'issued', invoiceNumber: 'CB/26-27/0001', mode: 'intra' });
    expect(invoice.seller.gstin).toBe('29EPDPR9174E1ZB');
  });

  it('refuses to render an invoice without a valid GSTIN', async () => {
    vi.stubEnv('BUSINESS_GSTIN', '');
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Invoice is temporarily unavailable');
  });
});
