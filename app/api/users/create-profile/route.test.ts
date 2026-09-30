import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  blockIfImpersonatingMock,
  checkRateLimitMock,
  createAdminSupabaseClientMock,
  getUserByIdMock,
  updateUserByIdMock,
} = vi.hoisted(() => {
  const getUserByIdMock = vi.fn();
  const updateUserByIdMock = vi.fn();
  return {
    blockIfImpersonatingMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    createAdminSupabaseClientMock: vi.fn(() => ({
      auth: { admin: { getUserById: getUserByIdMock, updateUserById: updateUserByIdMock } },
    })),
    getUserByIdMock,
    updateUserByIdMock,
  };
});

vi.mock('@/lib/utils/impersonation-guard', () => ({
  blockIfImpersonating: blockIfImpersonatingMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { checkRateLimit: checkRateLimitMock },
}));

vi.mock('@/lib/utils/validation', () => ({
  generateNameFromEmail: vi.fn(() => 'Generated Name'),
  validateRequiredPhoneNumber: vi.fn(() => ({ isValid: true })),
}));

import { POST } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/users/create-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10 });
});

describe('POST /api/users/create-profile impersonation guard', () => {
  it('returns 403 from guard when acting_as cookie is present', async () => {
    blockIfImpersonatingMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden while impersonating' }, { status: 403 })
    );
    const res = await POST(makeRequest({ userId: 'u1', email: 'e@example.com' }));
    expect(res.status).toBe(403);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it('proceeds to normal handler when guard passes', async () => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    getUserByIdMock.mockResolvedValue({
      data: { user: { email: 'e@example.com' } },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({ error: null });

    const res = await POST(makeRequest({ userId: 'u1', email: 'e@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// This route takes a caller-supplied userId with no session — anyone who knows an
// admin's id and email could otherwise demote them, rename them, or set their phone
// (and then sign in as them by OTP). An account that already has a role is left alone.
describe('POST /api/users/create-profile role preservation', () => {
  beforeEach(() => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    updateUserByIdMock.mockResolvedValue({ error: null });
  });

  it('writes nothing for an account that already has a role (no phone, no name, no role)', async () => {
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          email: 'e@example.com',
          app_metadata: { role: 'admin' },
          user_metadata: { full_name: 'Real Admin' },
        },
      },
      error: null,
    });

    const res = await POST(
      makeRequest({ userId: 'u1', email: 'e@example.com', phone: '9876543210' })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      profile: { id: 'u1', full_name: 'Real Admin' },
    });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('is also a no-op for a customer who is already initialised', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { email: 'e@example.com', app_metadata: { role: 'customer' } } },
      error: null,
    });

    const res = await POST(makeRequest({ userId: 'u1', email: 'e@example.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toEqual({ id: 'u1', full_name: null });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('sets role: customer for a user with no role yet', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { email: 'e@example.com', app_metadata: {} } },
      error: null,
    });

    const res = await POST(
      makeRequest({ userId: 'u1', email: 'e@example.com', phone: '98765 43210' })
    );
    expect(res.status).toBe(200);
    expect(updateUserByIdMock).toHaveBeenCalledWith('u1', {
      user_metadata: { full_name: 'Generated Name' },
      app_metadata: { role: 'customer' },
      phone: '9876543210',
    });
  });
});
