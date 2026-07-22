import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  singleSelectMock,
  upsertSingleMock,
  deleteEqMock,
  selectChainMock,
  upsertMock,
  fromMock,
  clientMock,
} = vi.hoisted(() => {
  const singleSelectMock = vi.fn();
  const eqSelectMock = vi.fn(() => ({ single: singleSelectMock }));
  const selectChainMock = vi.fn(() => ({ eq: eqSelectMock }));

  const upsertSingleMock = vi.fn();
  const upsertSelectMock = vi.fn(() => ({ single: upsertSingleMock }));
  const upsertMock = vi.fn(() => ({ select: upsertSelectMock }));

  const deleteEqMock = vi.fn();
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));

  const fromMock = vi.fn(() => ({
    select: selectChainMock,
    upsert: upsertMock,
    delete: deleteMock,
  }));

  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    singleSelectMock,
    upsertSingleMock,
    deleteEqMock,
    selectChainMock,
    upsertMock,
    fromMock,
    clientMock: { from: fromMock },
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

import { GET, POST, DELETE } from './route';
import { NextRequest, NextResponse } from 'next/server';

function successResult() {
  return {
    ok: true,
    userId: TARGET_ID,
    actingAdminId: ADMIN_ID,
    client: clientMock,
    sessionUser: { id: ADMIN_ID },
    effectiveUser: { id: TARGET_ID },
  };
}

describe('GET /api/cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cart scoped to effective userId when impersonating', async () => {
    singleSelectMock.mockResolvedValue({
      data: { items: [{ id: 'p1', quantity: 2 }] },
      error: null,
    });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      cart: [{ id: 'p1', quantity: 2 }],
      user_id: TARGET_ID,
    });
    expect(fromMock).toHaveBeenCalledWith('user_carts');
    const eqArgs = (selectChainMock.mock.results[0]?.value as any).eq.mock
      .calls[0];
    expect(eqArgs).toEqual(['user_id', TARGET_ID]);
  });

  it('returns 403 via helper on forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await GET();
    expect(res.status).toBe(403);
    expect(effectiveUserErrorResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'forbidden_not_admin' }),
      expect.objectContaining({ unauthenticatedMessage: 'Unauthorized' })
    );
  });
});

describe('POST /api/cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts cart with effective userId', async () => {
    upsertSingleMock.mockResolvedValue({
      data: { id: 'row-1', user_id: TARGET_ID, items: [] },
      error: null,
    });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const req = new NextRequest('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 'p1', quantity: 1 }] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, options] = (upsertMock.mock.calls[0] as any[]);
    expect(payload.user_id).toBe(TARGET_ID);
    expect(payload.items).toEqual([{ id: 'p1', quantity: 1 }]);
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('returns 403 on forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const req = new NextRequest('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/cart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes cart for effective userId', async () => {
    deleteEqMock.mockResolvedValue({ error: null });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: 'Cart cleared successfully',
    });
    expect(deleteEqMock).toHaveBeenCalledWith('user_id', TARGET_ID);
  });

  it('returns 403 on forbidden_not_admin', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
    effectiveUserErrorResponseMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await DELETE();
    expect(res.status).toBe(403);
  });
});
