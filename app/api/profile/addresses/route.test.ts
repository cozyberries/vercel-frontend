import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const { getEffectiveUserMock, effectiveUserErrorResponseMock, cacheServiceMock } =
  vi.hoisted(() => ({
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    cacheServiceMock: {
      getAddresses: vi.fn().mockResolvedValue({ data: null, ttl: 0, isStale: false }),
      setAddresses: vi.fn().mockResolvedValue(undefined),
      clearAddresses: vi.fn().mockResolvedValue(undefined),
      getCacheKey: vi.fn(() => 'key'),
    },
  }));

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/services/cache', () => ({
  default: cacheServiceMock,
}));

import { GET, POST } from './route';
import { NextRequest, NextResponse } from 'next/server';

describe('GET /api/profile/addresses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheServiceMock.getAddresses.mockResolvedValue({ data: null, ttl: 0, isStale: false });
  });

  it('filters addresses by effective userId', async () => {
    const order2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const order1 = vi.fn(() => ({ order: order2 }));
    const eqActive = vi.fn(() => ({ order: order1 }));
    const eqUser = vi.fn(() => ({ eq: eqActive }));
    const select = vi.fn(() => ({ eq: eqUser }));
    const from = vi.fn(() => ({ select }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith('user_addresses');
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
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

describe('POST /api/profile/addresses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts address with effective userId on user_id', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insertMock = vi.fn(() => ({ select: insertSelect }));

    const existingEqActive = vi.fn().mockResolvedValue({ data: [], error: null });
    const existingEqUser = vi.fn(() => ({ eq: existingEqActive }));
    const existingSelect = vi.fn(() => ({ eq: existingEqUser }));

    const from = vi.fn(() => ({ select: existingSelect, insert: insertMock }));

    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from },
      sessionUser: { id: ADMIN_ID },
      effectiveUser: { id: TARGET_ID },
    });

    const req = new NextRequest('http://localhost/api/profile/addresses', {
      method: 'POST',
      body: JSON.stringify({
        address_line_1: '123 Main',
        city: 'City',
        state: 'ST',
        postal_code: '12345',
        country: 'United States',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0];
    expect(Array.isArray(inserted) ? inserted[0].user_id : inserted.user_id).toBe(TARGET_ID);
    expect(existingEqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
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
    const req = new NextRequest('http://localhost/api/profile/addresses', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
