import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, insertMock, fromMock, adminClientMock } = vi.hoisted(() => {
  const insertMock = vi.fn(async () => ({ data: [{ id: 'a1' }], error: null }));
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return {
    getUserMock: vi.fn(),
    insertMock,
    fromMock,
    adminClientMock: vi.fn(() => ({ from: fromMock })),
  };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
  createAdminSupabaseClient: adminClientMock,
}));

import { POST } from './route';
import * as routeModule from './route';

function request(body: unknown) {
  return new Request('http://localhost/api/activities', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/activities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ data: [{ id: 'a1' }], error: null });
  });

  it('rejects an unauthenticated caller with 401', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(request({ type: 't', title: 'x', metadata: {} }));

    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('writes through the service-role client when authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const res = await POST(request({ type: 't', title: 'x', metadata: { a: 1 } }));

    expect(res.status).toBe(200);
    expect(adminClientMock).toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith('recent_activities');
  });

  it('still validates the payload before touching the database', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const res = await POST(request({ type: 't' }));

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no longer exposes a GET handler', () => {
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
