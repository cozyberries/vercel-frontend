import { beforeEach, describe, expect, it, vi } from 'vitest';

const { blockIfImpersonatingMock, generateAuthTokenMock, getUserMock } = vi.hoisted(() => ({
  blockIfImpersonatingMock: vi.fn(),
  generateAuthTokenMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/utils/impersonation-guard', () => ({
  blockIfImpersonating: blockIfImpersonatingMock,
}));

vi.mock('@/lib/jwt-auth', () => ({
  generateAuthToken: generateAuthTokenMock,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));

import { POST } from './route';
import { NextRequest, NextResponse } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/generate-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function signedInAs(id: string, email = `${id}@example.com`) {
  getUserMock.mockResolvedValue({ data: { user: { id, email } }, error: null });
}

describe('POST /api/auth/generate-token impersonation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 from guard when acting_as cookie is present', async () => {
    blockIfImpersonatingMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden while impersonating' }, { status: 403 })
    );
    const res = await POST(makeRequest({ userId: 'u1' }));
    expect(res.status).toBe(403);
    expect(generateAuthTokenMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('normal behavior when not impersonating', async () => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    signedInAs('u1', 'e@example.com');
    generateAuthTokenMock.mockResolvedValue('jwt-token');
    const res = await POST(makeRequest({ userId: 'u1', userEmail: 'e@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: 'jwt-token', success: true });
    expect(generateAuthTokenMock).toHaveBeenCalledWith('u1', 'e@example.com');
  });
});

describe('POST /api/auth/generate-token session binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    generateAuthTokenMock.mockResolvedValue('jwt-token');
  });

  it('rejects an unauthenticated caller with 401 and mints nothing', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest({ userId: 'victim-admin-id' }));

    expect(res.status).toBe(401);
    expect(generateAuthTokenMock).not.toHaveBeenCalled();
  });

  it('ignores a caller-supplied userId that is not the session user', async () => {
    signedInAs('customer-id', 'customer@example.com');

    const res = await POST(
      makeRequest({ userId: 'admin-id', userEmail: 'admin@example.com' })
    );

    expect(res.status).toBe(200);
    // Subject and email come from the verified session, never the body.
    expect(generateAuthTokenMock).toHaveBeenCalledTimes(1);
    expect(generateAuthTokenMock).toHaveBeenCalledWith('customer-id', 'customer@example.com');
  });

  it('mints for the session user when the body carries no userId at all', async () => {
    signedInAs('customer-id', 'customer@example.com');

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(generateAuthTokenMock).toHaveBeenCalledWith('customer-id', 'customer@example.com');
  });
});
