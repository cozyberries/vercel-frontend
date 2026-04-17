import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000099';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getUserMock,
  createServerSupabaseClientMock,
  getUserByIdMock,
  createAdminSupabaseClientMock,
  cookieGetMock,
  cookieDeleteMock,
  cookiesMock,
  verifyActingAsMock,
  logImpersonationEventMock,
  extractRequestMetadataMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const getUserByIdMock = vi.fn();
  const cookieGetMock = vi.fn();
  const cookieDeleteMock = vi.fn();
  const cookieStoreMock = { get: cookieGetMock, delete: cookieDeleteMock };
  return {
    getUserMock,
    createServerSupabaseClientMock: vi.fn(async () => ({
      auth: { getUser: getUserMock },
    })),
    getUserByIdMock,
    createAdminSupabaseClientMock: vi.fn(() => ({
      auth: { admin: { getUserById: getUserByIdMock } },
    })),
    cookieGetMock,
    cookieDeleteMock,
    cookiesMock: vi.fn(async () => cookieStoreMock),
    verifyActingAsMock: vi.fn(),
    logImpersonationEventMock: vi.fn().mockResolvedValue(undefined),
    extractRequestMetadataMock: vi.fn(() => ({ ip: '1.2.3.4', user_agent: 'ua' })),
  };
});

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

vi.mock('@/lib/utils/impersonation-cookie', () => ({
  verifyActingAs: verifyActingAsMock,
}));

vi.mock('@/lib/services/impersonation-audit', () => ({
  logImpersonationEvent: logImpersonationEventMock,
  extractRequestMetadata: extractRequestMetadataMock,
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest() {
  return new NextRequest('http://localhost/api/admin/impersonation/state', {
    method: 'GET',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/impersonation/state', () => {
  it('no session → inactive 200', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    cookieGetMock.mockReturnValue(undefined);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
    expect(cookieDeleteMock).not.toHaveBeenCalled();
  });

  it('no session but stale cookie → cookie cleared defensively + inactive', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    cookieGetMock.mockReturnValue({ value: 'leftover-token' });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
  });

  it('session but no cookie → inactive 200', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue(undefined);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
  });

  it('invalid cookie → cleared + inactive', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'garbage' });
    verifyActingAsMock.mockReturnValue({ status: 'invalid' });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
  });

  it('actor mismatch → cleared + inactive', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'token' });
    verifyActingAsMock.mockReturnValue({
      status: 'valid',
      payload: { actor_id: OTHER_ID, target_id: TARGET_ID, started_at: 1, exp: 2 },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
  });

  it('valid cookie + actor match + target exists → active', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'token' });
    verifyActingAsMock.mockReturnValue({
      status: 'valid',
      payload: { actor_id: ADMIN_ID, target_id: TARGET_ID, started_at: 1, exp: 2 },
    });
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: TARGET_ID,
          email: 'target@example.com',
          user_metadata: { full_name: 'Target User' },
        },
      },
      error: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      active: true,
      target: {
        id: TARGET_ID,
        email: 'target@example.com',
        full_name: 'Target User',
      },
    });
    expect(cookieDeleteMock).not.toHaveBeenCalled();
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('valid cookie but target deleted → cookie cleared + inactive + expired logged', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'token' });
    verifyActingAsMock.mockReturnValue({
      status: 'valid',
      payload: { actor_id: ADMIN_ID, target_id: TARGET_ID, started_at: 1, exp: 2 },
    });
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: false, target: null });
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        target_id: TARGET_ID,
        event_type: 'expired',
      })
    );
  });
});
