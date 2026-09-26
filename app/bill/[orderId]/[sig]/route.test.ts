import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORDER = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

const h = vi.hoisted(() => {
  const state: Record<string, any> = { order: null, error: null };
  const eqs: unknown[][] = [];
  const from = vi.fn(() => ({
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
  }));
  return { state, eqs, from, renderInvoicePdf: vi.fn(async () => Buffer.from('%PDF-1.3 test')) };
});

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));
vi.mock('@/lib/invoice/pdf', () => ({ renderInvoicePdf: h.renderInvoicePdf }));

import { GET } from './route';
import { signBill } from '@/lib/invoice/bill-link';
import { NextRequest } from 'next/server';

const paidPickup = {
  id: ORDER, order_number: 'ORD-1', created_at: '2026-09-26T08:58:00Z', status: 'collected',
  fulfilment_method: 'pickup', customer_name: 'Priya Sharma', customer_email: 'p@example.com', customer_phone: '9876543210',
  shipping_address: null, place_of_supply: '29', invoice_number: 'CB/26-27/0001', invoice_date: '2026-09-26T09:05:00Z',
  subtotal: 1050, discount_amount: 0, delivery_charge: 0, total_amount: 1050,
  order_items: [{ name: 'Frock', size: '3-4Y', color: null, price: 1050, quantity: 1 }],
  payments: [{ payment_method: 'cash', status: 'completed' }],
};

const call = (orderId: string, sig: string) =>
  GET(new NextRequest(`https://cozyberries.in/bill/${orderId}/${sig}`), { params: Promise.resolve({ orderId, sig }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.eqs.length = 0;
  h.state.order = paidPickup;
  h.state.error = null;
  vi.stubEnv('INVOICE_LINK_SECRET', 's'.repeat(40));
  vi.stubEnv('BUSINESS_GSTIN', '29EPDPR9174E1ZB');
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /bill/[orderId]/[sig]', () => {
  it('serves the invoice PDF for a correctly signed link', async () => {
    const res = await call(ORDER, signBill(ORDER));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="CozyBerries-Invoice-CB-26-27-0001.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(h.eqs).toEqual([['id', ORDER]]);
    const [doc] = h.renderInvoicePdf.mock.calls[0] as unknown as [{ status: string; seller: { gstin: string } }];
    expect(doc.status).toBe('issued');
    expect(doc.seller.gstin).toBe('29EPDPR9174E1ZB');
  });

  it('404s a wrong signature without touching the database', async () => {
    const res = await call(ORDER, signBill('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'));
    expect(res.status).toBe(404);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('404s a malformed order id without touching the database', async () => {
    const res = await call('not-a-uuid', signBill('not-a-uuid'));
    expect(res.status).toBe(404);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('404s a signed link whose order no longer exists, the same way', async () => {
    h.state.order = null;
    const res = await call(ORDER, signBill(ORDER));
    expect(res.status).toBe(404);
    expect(h.renderInvoicePdf).not.toHaveBeenCalled();
  });

  it('refuses to serve bills when the signing secret is missing', async () => {
    const sig = signBill(ORDER);
    vi.stubEnv('INVOICE_LINK_SECRET', '');
    const res = await call(ORDER, sig);
    expect(res.status).toBe(500);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('refuses to render a bill without a valid GSTIN', async () => {
    vi.stubEnv('BUSINESS_GSTIN', '');
    const res = await call(ORDER, signBill(ORDER));
    expect(res.status).toBe(500);
    expect(h.renderInvoicePdf).not.toHaveBeenCalled();
  });
});
