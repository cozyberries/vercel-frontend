import { beforeEach, describe, expect, it, vi } from 'vitest';

const { blockIfImpersonatingMock, generateAuthTokenMock } = vi.hoisted(() => ({
  blockIfImpersonatingMock: vi.fn(),
  generateAuthTokenMock: vi.fn(),
}));

vi.mock('@/lib/utils/impersonation-guard', () => ({
  blockIfImpersonating: blockIfImpersonatingMock,
}));

vi.mock('@/lib/jwt-auth', () => ({
  generateAuthToken: generateAuthTokenMock,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/generate-token impersonation guard', () => {
  it('returns 403 from guard when acting_as cookie is present', async () => {
    blockIfImpersonatingMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden while impersonating' }, { status: 403 })
    );
    const res = await POST(makeRequest({ userId: 'u1' }));
    expect(res.status).toBe(403);
    expect(generateAuthTokenMock).not.toHaveBeenCalled();
  });

  it('normal behavior when not impersonating', async () => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    generateAuthTokenMock.mockResolvedValue('jwt-token');
    const res = await POST(makeRequest({ userId: 'u1', userEmail: 'e@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: 'jwt-token', success: true });
  });

  it('returns 400 when userId missing (guard passed)', async () => {
    blockIfImpersonatingMock.mockResolvedValue(undefined);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
