import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getUserMock,
  createServerSupabaseClientMock,
  getUserByIdMock,
  createAdminSupabaseClientMock,
  cookieStoreMock,
  cookiesMock,
  signActingAsMock,
  logImpersonationEventMock,
  extractRequestMetadataMock,
  checkRateLimitMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const getUserByIdMock = vi.fn();
  const cookieSetMock = vi.fn();
  const cookieStoreMock = { set: cookieSetMock };
  return {
    getUserMock,
    createServerSupabaseClientMock: vi.fn(async () => ({
      auth: { getUser: getUserMock },
    })),
    getUserByIdMock,
    createAdminSupabaseClientMock: vi.fn(() => ({
      auth: { admin: { getUserById: getUserByIdMock } },
    })),
    cookieStoreMock,
    cookiesMock: vi.fn(async () => cookieStoreMock),
    signActingAsMock: vi.fn(() => 'signed-token'),
    logImpersonationEventMock: vi.fn().mockResolvedValue(undefined),
    extractRequestMetadataMock: vi.fn(() => ({
      ip: '1.2.3.4',
      user_agent: 'ua',
    })),
    checkRateLimitMock: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

vi.mock('@/lib/utils/impersonation-cookie', () => ({
  signActingAs: signActingAsMock,
}));

vi.mock('@/lib/services/impersonation-audit', () => ({
  logImpersonationEvent: logImpersonationEventMock,
  extractRequestMetadata: extractRequestMetadataMock,
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { checkRateLimit: checkRateLimitMock },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/impersonation/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function adminUser() {
  return {
    id: ADMIN_ID,
    email: 'admin@example.com',
    app_metadata: { role: 'admin' },
  };
}

function nonAdminUser() {
  return {
    id: ADMIN_ID,
    email: 'u@example.com',
    app_metadata: { role: 'customer' },
  };
}

function targetUserRow() {
  return {
    user: {
      id: TARGET_ID,
      email: 'target@example.com',
      user_metadata: { full_name: 'Target User' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 29 });
});

describe('POST /api/admin/impersonation/start', () => {
  it('happy path: sets cookie, logs start event, returns target', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    getUserByIdMock.mockResolvedValue({ data: targetUserRow(), error: null });

    const res = await POST(makeRequest({ target_user_id: TARGET_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      target: {
        id: TARGET_ID,
        email: 'target@example.com',
        full_name: 'Target User',
      },
    });

    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      'acting_as',
      'signed-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 2 * 60 * 60,
        secure: process.env.NODE_ENV === 'production',
      })
    );
    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        target_id: TARGET_ID,
        event_type: 'start',
        ip: '1.2.3.4',
        user_agent: 'ua',
        metadata: { target_email: 'target@example.com', target_name: 'Target User' },
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest({ target_user_id: TARGET_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when session user is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: nonAdminUser() }, error: null });
    const res = await POST(makeRequest({ target_user_id: TARGET_ID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when target_user_id is missing', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when target_user_id is not a UUID', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest({ target_user_id: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when self-impersonating', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest({ target_user_id: ADMIN_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Cannot impersonate yourself' });
  });

  it('returns 404 when target user does not exist', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const res = await POST(makeRequest({ target_user_id: TARGET_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Target user not found' });
  });

  it('returns 429 when rate-limited', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest({ target_user_id: TARGET_ID }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Rate limit exceeded' });
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });
});
