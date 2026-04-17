import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000099';
const TARGET_ID = '00000000-0000-0000-0000-000000000002';

const {
  getUserMock,
  createServerSupabaseClientMock,
  cookieGetMock,
  cookieDeleteMock,
  cookiesMock,
  verifyActingAsMock,
  logImpersonationEventMock,
  extractRequestMetadataMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const cookieGetMock = vi.fn();
  const cookieDeleteMock = vi.fn();
  const cookieStoreMock = { get: cookieGetMock, delete: cookieDeleteMock };
  return {
    getUserMock,
    createServerSupabaseClientMock: vi.fn(async () => ({
      auth: { getUser: getUserMock },
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
}));

vi.mock('@/lib/utils/impersonation-cookie', () => ({
  verifyActingAs: verifyActingAsMock,
}));

vi.mock('@/lib/services/impersonation-audit', () => ({
  logImpersonationEvent: logImpersonationEventMock,
  extractRequestMetadata: extractRequestMetadataMock,
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest() {
  return new NextRequest('http://localhost/api/admin/impersonation/stop', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/impersonation/stop', () => {
  it('clears cookie and logs stop when cookie valid and actor matches', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'token' });
    verifyActingAsMock.mockReturnValue({
      status: 'valid',
      payload: { actor_id: ADMIN_ID, target_id: TARGET_ID, started_at: 1, exp: 2 },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        target_id: TARGET_ID,
        event_type: 'stop',
      })
    );
  });

  it('cookie present but wrong actor → cleared, no event', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'token' });
    verifyActingAsMock.mockReturnValue({
      status: 'valid',
      payload: { actor_id: OTHER_ID, target_id: TARGET_ID, started_at: 1, exp: 2 },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('cookie present but invalid → cleared, no event', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
    cookieGetMock.mockReturnValue({ value: 'garbage' });
    verifyActingAsMock.mockReturnValue({ status: 'invalid' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('no session → cookie cleared defensively, 200, no event', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    cookieGetMock.mockReturnValue({ value: 'token' });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(cookieDeleteMock).toHaveBeenCalledWith('acting_as');
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });

  it('no session and no cookie → 200, nothing logged', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    cookieGetMock.mockReturnValue(undefined);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(logImpersonationEventMock).not.toHaveBeenCalled();
  });
});
