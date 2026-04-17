import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getEffectiveUserMock,
  effectiveUserErrorResponseMock,
  createAdminSupabaseClientMock,
  updateUserByIdMock,
  getUserByIdMock,
  cacheServiceMock,
  findAuthUserByEmailMock,
  notifyNewUserRegisteredMock,
} = vi.hoisted(() => {
  const updateUserByIdMock = vi.fn();
  const getUserByIdMock = vi.fn();
  const adminClientMock = {
    auth: {
      admin: {
        updateUserById: updateUserByIdMock,
        getUserById: getUserByIdMock,
      },
    },
  };
  return {
    getEffectiveUserMock: vi.fn(),
    effectiveUserErrorResponseMock: vi.fn(),
    createAdminSupabaseClientMock: vi.fn(() => adminClientMock),
    updateUserByIdMock,
    getUserByIdMock,
    cacheServiceMock: {
      getProfile: vi.fn().mockResolvedValue({ data: null, ttl: 0, isStale: false }),
      setProfile: vi.fn().mockResolvedValue(undefined),
      clearProfile: vi.fn().mockResolvedValue(undefined),
      getCacheKey: vi.fn(() => 'key'),
    },
    findAuthUserByEmailMock: vi.fn(),
    notifyNewUserRegisteredMock: vi.fn(),
  };
});

vi.mock('@/lib/services/effective-user', () => ({
  getEffectiveUser: getEffectiveUserMock,
  effectiveUserErrorResponse: effectiveUserErrorResponseMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

vi.mock('@/lib/services/cache', () => ({
  default: cacheServiceMock,
}));

vi.mock('@/lib/auth-phone', () => ({
  findAuthUserByEmail: findAuthUserByEmailMock,
}));

vi.mock('@/lib/services/telegram', () => ({
  notifyNewUserRegistered: notifyNewUserRegisteredMock,
}));

import { GET, PUT } from './route';
import { NextRequest, NextResponse } from 'next/server';

describe('GET /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheServiceMock.getProfile.mockResolvedValue({ data: null, ttl: 0, isStale: false });
  });

  it('builds the profile from the effective user and keys cache by userId', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: {
        id: TARGET_ID,
        email: 'target@example.com',
        phone: null,
        user_metadata: { full_name: 'Target User' },
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TARGET_ID);
    expect(body.email).toBe('target@example.com');
    expect(body.full_name).toBe('Target User');

    expect(cacheServiceMock.getProfile).toHaveBeenCalledWith(TARGET_ID);
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

describe('PUT /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserByIdMock.mockResolvedValue({ error: null });
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { full_name: 'Target' }, phone: '+910000000000' } },
    });
  });

  it('updates full_name/phone against effective userId when impersonating', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: {
        id: TARGET_ID,
        email: 'target@example.com',
        user_metadata: { full_name: 'Old Name' },
        created_at: '2024-01-01',
      },
    });

    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ full_name: 'New Name', phone: '+919999999999' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);

    expect(updateUserByIdMock).toHaveBeenCalledWith(
      TARGET_ID,
      expect.objectContaining({
        user_metadata: expect.objectContaining({ full_name: 'New Name' }),
        phone: '+919999999999',
      })
    );
    // First getUserById (first-phone detection) keyed by target id
    expect(getUserByIdMock).toHaveBeenCalledWith(TARGET_ID);
  });

  it('blocks email change while acting as another user (403 with field=email)', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: { from: vi.fn() },
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com', user_metadata: {}, created_at: '2024-01-01' },
    });

    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ email: 'new@example.com' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Identity changes not permitted while acting as another user',
      field: 'email',
    });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
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

    const req = new NextRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: '{}',
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });
});
