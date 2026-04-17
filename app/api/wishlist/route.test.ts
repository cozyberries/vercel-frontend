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
  deleteMock,
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
    deleteMock,
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

describe('GET /api/wishlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns wishlist scoped to effective userId when impersonating', async () => {
    singleSelectMock.mockResolvedValue({
      data: { items: [{ id: 'w1' }] },
      error: null,
    });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      wishlist: [{ id: 'w1' }],
      user_id: TARGET_ID,
    });
    expect(fromMock).toHaveBeenCalledWith('user_wishlists');
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

describe('POST /api/wishlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts wishlist with effective userId', async () => {
    upsertSingleMock.mockResolvedValue({
      data: { id: 'row-1', user_id: TARGET_ID, items: [] },
      error: null,
    });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const req = new NextRequest('http://localhost/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 'w1' }] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, options] = (upsertMock.mock.calls[0] as any[]);
    expect(payload.user_id).toBe(TARGET_ID);
    expect(payload.items).toEqual([{ id: 'w1' }]);
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

    const req = new NextRequest('http://localhost/api/wishlist', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/wishlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes wishlist for effective userId', async () => {
    deleteEqMock.mockResolvedValue({ error: null });
    getEffectiveUserMock.mockResolvedValue(successResult());

    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: 'Wishlist cleared successfully',
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
