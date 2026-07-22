import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const { getEffectiveUserMock, effectiveUserErrorResponseMock, cacheServiceMock } =
  vi.hoisted(() => ({
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    cacheServiceMock: {
      clearAddresses: vi.fn().mockResolvedValue(undefined),
    },
  }));

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/services/cache', () => ({
  default: cacheServiceMock,
}));

import { GET, PUT, DELETE } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/profile/addresses/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes query by effective userId', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null });
    const eqUser = vi.fn(() => ({ single }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ select }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET(
      new NextRequest('http://localhost/api/profile/addresses/a1'),
      makeParams('a1')
    );
    expect(res.status).toBe(200);
    expect(eqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
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
    const res = await GET(
      new NextRequest('http://localhost/api/profile/addresses/a1'),
      makeParams('a1')
    );
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/profile/addresses/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes update by effective userId', async () => {
    // check-query: select id, is_default → .eq('user_id', …).eq('is_active', true)
    const checkEqActive = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'a1', is_default: true }, { id: 'a2', is_default: false }], error: null });
    const checkEqUser = vi.fn(() => ({ eq: checkEqActive }));
    const checkSelect = vi.fn(() => ({ eq: checkEqUser }));

    // final update: .update().eq('id').eq('user_id').select().single()
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null });
    const updateSelectChain = vi.fn(() => ({ single: updateSingle }));
    const updateEqUser = vi.fn(() => ({ select: updateSelectChain }));
    const updateEqId = vi.fn(() => ({ eq: updateEqUser }));

    // unset default update: .update().eq('user_id').eq('is_default', true).neq('id')
    const unsetNeq = vi.fn().mockResolvedValue({ error: null });
    const unsetEqDefault = vi.fn(() => ({ neq: unsetNeq }));
    const unsetEqUser = vi.fn(() => ({ eq: unsetEqDefault }));

    // The update function is called twice; first call is unset (path via .eq().eq().neq()),
    // second call is final update (path via .eq().eq().select().single()). Distinguish
    // by the first .eq() argument name.
    const updateMock = vi.fn((payload: Record<string, unknown>) => {
      if (payload.is_default === false && Object.keys(payload).length === 1) {
        return { eq: unsetEqUser };
      }
      return { eq: updateEqId };
    });

    const from = vi.fn(() => ({ select: checkSelect, update: updateMock }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const req = new NextRequest('http://localhost/api/profile/addresses/a1', {
      method: 'PUT',
      body: JSON.stringify({
        address_line_1: '123 Main',
        city: 'City',
        state: 'ST',
        postal_code: '12345',
        country: 'United States',
        is_default: true,
      }),
    });

    const res = await PUT(req, makeParams('a1'));
    expect(res.status).toBe(200);
    expect(checkEqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
    expect(updateEqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
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
    const req = new NextRequest('http://localhost/api/profile/addresses/a1', {
      method: 'PUT',
      body: '{}',
    });
    const res = await PUT(req, makeParams('a1'));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/profile/addresses/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes soft-delete by effective userId', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null });
    const selectChain = vi.fn(() => ({ single }));
    const eqUser = vi.fn(() => ({ select: selectChain }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const updateMock = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update: updateMock }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await DELETE(
      new NextRequest('http://localhost/api/profile/addresses/a1', { method: 'DELETE' }),
      makeParams('a1')
    );
    expect(res.status).toBe(200);
    expect(eqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
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
    const res = await DELETE(
      new NextRequest('http://localhost/api/profile/addresses/a1', { method: 'DELETE' }),
      makeParams('a1')
    );
    expect(res.status).toBe(403);
  });
});
