import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const { getEffectiveUserMock, effectiveUserErrorResponseMock, cacheServiceMock } =
  vi.hoisted(() => ({
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    cacheServiceMock: {
      getProfile: vi.fn().mockResolvedValue({ data: null, ttl: 0, isStale: false }),
      getAddresses: vi.fn().mockResolvedValue({ data: null, ttl: 0, isStale: false }),
      setProfile: vi.fn().mockResolvedValue(undefined),
      setAddresses: vi.fn().mockResolvedValue(undefined),
    },
  }));

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/services/cache', () => ({
  default: cacheServiceMock,
}));

import { GET } from './route';
import { NextResponse } from 'next/server';

describe('GET /api/profile/combined', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheServiceMock.getProfile.mockResolvedValue({ data: null, ttl: 0, isStale: false });
    cacheServiceMock.getAddresses.mockResolvedValue({ data: null, ttl: 0, isStale: false });
  });

  it('builds profile from effective user and scopes addresses query by userId', async () => {
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
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: {
        id: TARGET_ID,
        email: 'target@example.com',
        user_metadata: { full_name: 'Target User' },
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.id).toBe(TARGET_ID);
    expect(body.profile.email).toBe('target@example.com');
    expect(eqUser).toHaveBeenCalledWith('user_id', TARGET_ID);
    expect(cacheServiceMock.getProfile).toHaveBeenCalledWith(TARGET_ID);
    expect(cacheServiceMock.getAddresses).toHaveBeenCalledWith(TARGET_ID);
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
    expect(effectiveUserErrorResponseMock).toHaveBeenCalled();
  });
});
