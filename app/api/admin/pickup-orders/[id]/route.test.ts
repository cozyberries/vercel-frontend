import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const calls: Record<string, any[]> = {};
  const reset = () => {
    Object.assign(state, {
      user: { id: 'admin-1', app_metadata: { role: 'admin' } },
      current: { status: 'processing' },
      updated: { data: [{ id: 'order-1', status: 'ready_for_pickup', order_number: 'ORD-1', customer_phone: '9876543210', invoice_number: 'CB/26-27/0001' }], error: null },
    });
    calls.updates = [];
    calls.updateEqs = [];
    calls.events = [];
  };
  reset();
  const admin = {
    from: (table: string) => {
      if (table === 'order_status_events') {
        return { insert: async (v: unknown) => { calls.events.push(v); return { error: null }; } };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.current, error: null }) }) }) }),
        update: (values: unknown) => {
          calls.updates.push(values);
          const eqs: unknown[] = [];
          calls.updateEqs.push(eqs);
          const chain: any = { eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain; }, select: async () => state.updated };
          return chain;
        },
      };
    },
  };
  return { state, calls, reset, admin };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.state.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => h.admin),
}));

import { PATCH } from './route';
import { NextRequest } from 'next/server';

const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/admin/pickup-orders/order-1', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'order-1' }),
  });

beforeEach(() => h.reset());

describe('PATCH /api/admin/pickup-orders/[id]', () => {
  it('requires a session', async () => {
    h.state.user = null;
    expect((await patch({ action: 'ready' })).status).toBe(401);
  });

  it('requires an admin', async () => {
    h.state.user = { id: 'u', app_metadata: { role: 'customer' } };
    expect((await patch({ action: 'ready' })).status).toBe(403);
  });

  it('rejects an unknown action', async () => {
    expect((await patch({ action: 'shipped' })).status).toBe(400);
  });

  it('404s for an order that is not a pickup order', async () => {
    h.state.current = null;
    expect((await patch({ action: 'ready' })).status).toBe(404);
  });

  it('409s for a transition that is not allowed (collected → ready)', async () => {
    h.state.current = { status: 'collected' };
    const res = await patch({ action: 'ready' });
    expect(res.status).toBe(409);
    expect(h.calls.updates).toHaveLength(0);
  });

  it('marks a paid order ready, conditional on its status, and audits it', async () => {
    const res = await patch({ action: 'ready' });
    expect(res.status).toBe(200);
    expect(h.calls.updates[0]).toEqual({ status: 'ready_for_pickup' });
    expect(h.calls.updateEqs[0]).toEqual([['id', 'order-1'], ['fulfilment_method', 'pickup'], ['status', 'processing']]);
    expect(h.calls.events[0]).toEqual({ order_id: 'order-1', from_status: 'processing', to_status: 'ready_for_pickup', actor_admin_id: 'admin-1' });
  });

  it('409s when someone else moved the order first', async () => {
    h.state.updated = { data: [], error: null };
    expect((await patch({ action: 'collected' })).status).toBe(409);
    expect(h.calls.events).toHaveLength(0);
  });
});
