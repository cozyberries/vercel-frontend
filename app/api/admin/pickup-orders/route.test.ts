import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const calls: any[] = [];
  const reset = () => {
    state.user = { id: 'admin-1', app_metadata: { role: 'admin' } };
    state.rows = [{ id: 'order-1' }];
    calls.length = 0;
  };
  reset();
  const chain: any = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'ilike', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => { calls.push([m, ...args]); return chain; };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.rows, error: null }).then(resolve);
  return { state, calls, reset, admin: { from: () => chain } };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.state.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => h.admin),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

const get = (qs = '') => GET(new NextRequest(`http://localhost/api/admin/pickup-orders${qs}`));

beforeEach(() => h.reset());

describe('GET /api/admin/pickup-orders', () => {
  it('requires an admin', async () => {
    h.state.user = { id: 'u', app_metadata: {} };
    expect((await get()).status).toBe(403);
  });

  it('lists paid pickup orders for the hand-over tab', async () => {
    const res = await get('?tab=handover');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders: [{ id: 'order-1' }] });
    expect(h.calls).toContainEqual(['eq', 'fulfilment_method', 'pickup']);
    expect(h.calls).toContainEqual(['in', 'status', ['payment_confirmed', 'processing']]);
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
