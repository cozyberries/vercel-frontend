import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(async () => ({ get: vi.fn() })),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

import { blockIfImpersonating } from './impersonation-guard';

describe('blockIfImpersonating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when acting_as cookie is absent', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) } as any);
    const result = await blockIfImpersonating();
    expect(result).toBeUndefined();
  });

  it('fails CLOSED with 500 when cookie read throws (defense-in-depth)', async () => {
    cookiesMock.mockRejectedValue(new Error('boom'));
    const result = await blockIfImpersonating();
    expect(result).toBeDefined();
    expect(result!.status).toBe(500);
    const body = await result!.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });

  it('returns 403 NextResponse when acting_as cookie is present with any value', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: 'some-token' })),
    } as any);
    const result = await blockIfImpersonating();
    expect(result).toBeDefined();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body).toEqual({ error: 'Forbidden while impersonating' });
  });

  it('returns 403 even when cookie value is an obvious garbage string', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: 'not-a-jwt' })),
    } as any);
    const result = await blockIfImpersonating();
    expect(result).toBeDefined();
    expect(result!.status).toBe(403);
  });
});
