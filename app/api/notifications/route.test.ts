import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  createAdminSupabaseClientMock,
  insertMock,
  insertSingleMock,
  selectOrderMock,
  selectEqMock,
  fromMock,
} = vi.hoisted(() => {
  const insertSingleMock = vi.fn();
  const insertSelectMock = vi.fn(() => ({ single: insertSingleMock }));
  const insertMock = vi.fn(() => ({ select: insertSelectMock }));

  const selectOrderMock = vi.fn();
  const selectEqMock = vi.fn(() => ({ order: selectOrderMock }));
  const selectMock = vi.fn(() => ({ eq: selectEqMock }));

  const fromMock = vi.fn(() => ({ insert: insertMock, select: selectMock }));
  const adminClientMock = { from: fromMock };
  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    createAdminSupabaseClientMock: vi.fn(() => adminClientMock),
    insertMock,
    insertSingleMock,
    selectOrderMock,
    selectEqMock,
    fromMock,
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

import { POST, GET } from './route';
import { NextResponse } from 'next/server';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/notifications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertSingleMock.mockResolvedValue({ data: { id: 'n1' }, error: null });
  });

  it('inserts notification with effective userId on user_id', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await POST(
      makeRequest({ title: 'hello', message: 'world', type: 'info' })
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = (insertMock.mock.calls[0] as any[])[0];
    expect(Array.isArray(inserted) ? inserted[0].user_id : inserted.user_id).toBe(
      TARGET_ID
    );
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
    const res = await POST(makeRequest({ title: 't', message: 'm' }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectOrderMock.mockResolvedValue({ data: [], error: null });
  });

  it('filters notifications by effective userId', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith('notifications');
    expect(selectEqMock).toHaveBeenCalledWith('user_id', TARGET_ID);
  });

  it('returns empty list when unauthenticated (backward compat)', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
      clearCookie: false,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ notifications: [] });
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
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
