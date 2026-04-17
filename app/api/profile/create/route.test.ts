import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  blockIfImpersonatingMock,
  createServerSupabaseClientMock,
  createAdminSupabaseClientMock,
  getUserMock,
  getUserByIdMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const getUserByIdMock = vi.fn();
  return {
    blockIfImpersonatingMock: vi.fn(),
    createServerSupabaseClientMock: vi.fn(async () => ({
      auth: { getUser: getUserMock },
    })),
    createAdminSupabaseClientMock: vi.fn(() => ({
      auth: { admin: { getUserById: getUserByIdMock, updateUserById: vi.fn() } },
    })),
    getUserMock,
    getUserByIdMock,
  };
});

vi.mock('@/lib/utils/impersonation-guard', () => ({
  blockIfImpersonating: blockIfImpersonatingMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

import { POST } from './route';
import { NextResponse } from 'next/server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/profile/create impersonation guard', () => {
  it('returns 403 from guard when acting_as cookie is present', async () => {
    blockIfImpersonatingMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden while impersonating' }, { status: 403 })
    );
    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden while impersonating' });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('proceeds to normal handler when guard passes', async () => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    getUserByIdMock.mockResolvedValue({
      data: { user: { app_metadata: { role: 'customer' } } },
    });

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toEqual({ id: 'u1', role: 'customer' });
  });
});
