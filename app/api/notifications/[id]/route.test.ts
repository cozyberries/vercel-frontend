import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  createAdminSupabaseClientMock,
  maybeSingleMock,
  eqUserMock,
  eqIdMock,
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const selectMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const eqUserMock = vi.fn(() => ({ select: selectMock }));
  const eqIdMock = vi.fn(() => ({ eq: eqUserMock }));
  const updateMock = vi.fn(() => ({ eq: eqIdMock }));
  const fromMock = vi.fn(() => ({ update: updateMock }));

  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    createAdminSupabaseClientMock: vi.fn(() => ({ from: fromMock })),
    maybeSingleMock,
    eqUserMock,
    eqIdMock,
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

import { PATCH } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/notifications/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({ data: { id: 'n1' }, error: null });
  });

  it('scopes update by effective userId', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/notifications/n1', { method: 'PATCH' }),
      makeParams('n1')
    );
    expect(res.status).toBe(200);
    expect(eqIdMock).toHaveBeenCalledWith('id', 'n1');
    expect(eqUserMock).toHaveBeenCalledWith('user_id', TARGET_ID);
  });

  it('returns error response when getEffectiveUser rejects with forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await PATCH(
      new NextRequest('http://localhost/api/notifications/n1', { method: 'PATCH' }),
      makeParams('n1')
    );
    expect(res.status).toBe(403);
  });
});
