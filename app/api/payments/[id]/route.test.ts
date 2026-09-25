import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const updates: unknown[] = [];
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: { id: 'pay-1', status: 'processing', order_id: 'o1' }, error: null }) }) }) }),
      update: (values: unknown) => {
        updates.push(values);
        return { eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'pay-1', order_id: 'o1' }, error: null }) }) }) }) };
      },
    }),
  };
  return { updates, client };
});

vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: vi.fn(async () => h.client) }));
vi.mock('@/lib/services/cache', () => ({ default: { clearAllOrders: vi.fn(), clearOrderDetails: vi.fn() } }));

import { PATCH } from './route';
import { NextRequest } from 'next/server';

const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/payments/pay-1', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'pay-1' }),
  });

beforeEach(() => {
  h.updates.length = 0;
});

describe('PATCH /api/payments/[id]', () => {
  it('never lets the customer change the payment status', async () => {
    const res = await patch({ status: 'completed', notes: 'paid' });
    expect(res.status).toBe(200);
    expect(h.updates).toEqual([{ notes: 'paid' }]);
  });

  it('rejects a body that only tries to change status', async () => {
    const res = await patch({ status: 'completed' });
    expect(res.status).toBe(400);
    expect(h.updates).toHaveLength(0);
  });
});
