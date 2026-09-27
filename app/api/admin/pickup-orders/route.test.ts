import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const calls: any[] = [];
  const reset = () => {
    state.user = { id: 'admin-1', app_metadata: { role: 'admin' } };
    state.rows = [{ id: 'order-1' }];
    state.count = { count: 0, error: null };
    calls.length = 0;
  };
  reset();
  // One chain per from(): a head-count select resolves to state.count, anything else to the rows.
  const makeChain = () => {
    const chain: any = { isCount: false };
    for (const m of ['select', 'eq', 'in', 'gte', 'ilike', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        if (m === 'select' && (args[1] as { head?: boolean } | undefined)?.head) chain.isCount = true;
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(chain.isCount ? state.count : { data: state.rows, error: null }).then(resolve);
    return chain;
  };
  return { state, calls, reset, admin: { from: () => makeChain() } };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.state.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => h.admin),
}));

import { GET } from './route';
import { billUrl } from '@/lib/invoice/bill-link';
import { NextRequest } from 'next/server';

const get = (qs = '') => GET(new NextRequest(`http://localhost/api/admin/pickup-orders${qs}`));

beforeEach(() => {
  h.reset();
  vi.stubEnv('INVOICE_LINK_SECRET', 's'.repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/admin/pickup-orders', () => {
  it('requires an admin', async () => {
    h.state.user = { id: 'u', app_metadata: {} };
    expect((await get()).status).toBe(403);
  });

  it('lists paid pickup orders for the hand-over tab', async () => {
    const res = await get('?tab=handover');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders: [{ id: 'order-1', bill_url: billUrl('order-1') }], awaiting_count: 0 });
    expect(h.calls).toContainEqual(['eq', 'fulfilment_method', 'pickup']);
    expect(h.calls).toContainEqual(['in', 'status', ['payment_confirmed', 'processing']]);
  });

  it('lists unpaid pickup orders for the awaiting tab', async () => {
    const res = await get('?tab=awaiting');
    expect(res.status).toBe(200);
    // Once for the list, once for the tab count.
    expect(h.calls.filter((c) => c[0] === 'in' && c[1] === 'status')).toEqual([
      ['in', 'status', ['payment_pending', 'verifying_payment']],
      ['in', 'status', ['payment_pending', 'verifying_payment']],
    ]);
  });

  it('counts pickup orders awaiting confirmation on every tab', async () => {
    h.state.count = { count: 2, error: null };
    const res = await get('?tab=ready');
    expect((await res.json()).awaiting_count).toBe(2);
    expect(h.calls).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(h.calls).toContainEqual(['in', 'status', ['payment_pending', 'verifying_payment']]);
    expect(h.calls).toContainEqual(['in', 'status', ['ready_for_pickup']]);
  });

  it('still lists orders when the awaiting count fails', async () => {
    h.state.count = { count: null, error: { message: 'boom' } };
    const res = await get('?tab=handover');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders: [{ id: 'order-1', bill_url: billUrl('order-1') }], awaiting_count: null });
  });

  it('still lists orders, without bill links, when the signing secret is missing', async () => {
    vi.stubEnv('INVOICE_LINK_SECRET', '');
    const res = await get('?tab=handover');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders: [{ id: 'order-1', bill_url: null }], awaiting_count: 0 });
  });

  it('selects each line price so staff can check the card against the bill', async () => {
    await get('?tab=handover');
    const select = String(h.calls.find((c) => c[0] === 'select')?.[1] ?? '');
    expect(select).toMatch(/order_items\([^)]*\bprice\b[^)]*\)/);
  });

  it('limits the collected tab to today in IST', async () => {
    await get('?tab=collected');
    expect(h.calls.find((c) => c[0] === 'gte')?.[1]).toBe('updated_at');
  });

  it('searches by phone digits across every pickup state', async () => {
    await get('?q=98765%2043210');
    expect(h.calls).toContainEqual(['ilike', 'customer_phone', '%9876543210%']);
    expect(h.calls).toContainEqual(['in', 'status', ['payment_pending', 'verifying_payment', 'payment_confirmed', 'processing', 'ready_for_pickup', 'collected']]);
  });

  it('searches by order number when the query is not a phone', async () => {
    await get('?q=ORD-2026');
    expect(h.calls).toContainEqual(['ilike', 'order_number', '%ORD-2026%']);
  });

  it('finds a 10-digit stored phone when searched with the +91 country code', async () => {
    await get('?q=%2B91%2098765%2043210');
    expect(h.calls).toContainEqual(['ilike', 'customer_phone', '%9876543210%']);
  });

  it('rejects an unknown tab', async () => {
    expect((await get('?tab=bogus')).status).toBe(400);
  });
});
