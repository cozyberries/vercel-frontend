import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'test-secret-for-vitest-do-not-use-in-prod';

const mockSessionClient = {
  auth: {
    getUser: vi.fn(),
  },
};

const mockAdminClient = {
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
};

const mockCookieStore = {
  get: vi.fn(),
};

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => mockSessionClient),
  createAdminSupabaseClient: vi.fn(() => mockAdminClient),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

import { getEffectiveUser, isAdmin } from './effective-user';
import { signActingAs } from '@/lib/utils/impersonation-cookie';

function setSessionUser(user: unknown) {
  mockSessionClient.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  });
}

function setCookie(value: string | undefined) {
  mockCookieStore.get.mockImplementation((name: string) =>
    name === 'acting_as' && value !== undefined ? { value } : undefined
  );
}

function setTargetUser(user: unknown) {
  mockAdminClient.auth.admin.getUserById.mockResolvedValue({
    data: user ? { user } : null,
    error: user ? null : { message: 'not found' },
  });
}

describe('isAdmin', () => {
  it('returns true for admin role', () => {
    expect(isAdmin({ id: 'x', app_metadata: { role: 'admin' } } as never)).toBe(true);
  });
  it('returns true for super_admin role', () => {
    expect(
      isAdmin({ id: 'x', app_metadata: { role: 'super_admin' } } as never)
    ).toBe(true);
  });
  it('returns false for customer role', () => {
    expect(
      isAdmin({ id: 'x', app_metadata: { role: 'customer' } } as never)
    ).toBe(false);
  });
  it('returns false when role missing', () => {
    expect(isAdmin({ id: 'x', app_metadata: {} } as never)).toBe(false);
  });
});

describe('getEffectiveUser', () => {
  const adminId = '00000000-0000-0000-0000-000000000001';
  const targetId = '00000000-0000-0000-0000-000000000002';
  const customerId = '00000000-0000-0000-0000-000000000003';

  const adminUser = { id: adminId, app_metadata: { role: 'admin' } };
  const customerUser = { id: customerId, app_metadata: { role: 'customer' } };
  const targetUser = { id: targetId, app_metadata: { role: 'customer' } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', TEST_SECRET);
    setCookie(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 401 unauthenticated when no session', async () => {
    setSessionUser(null);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      reason: 'unauthenticated',
      clearCookie: false,
    });
  });

  it('returns session user when no cookie is present', async () => {
    setSessionUser(customerUser);

    const result = await getEffectiveUser();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.userId).toBe(customerId);
    expect(result.actingAdminId).toBeNull();
    expect(result.sessionUser).toBe(customerUser);
    expect(result.client).toBe(mockSessionClient);
  });

  it('returns 403 forbidden_not_admin when non-admin has a valid cookie', async () => {
    setSessionUser(customerUser);
    const token = signActingAs({
      actor_id: customerId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    setCookie(token);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
  });

  it('returns 403 forbidden_not_admin when non-admin presents a tampered cookie (admin check runs first)', async () => {
    setSessionUser(customerUser);
    setCookie('not-a-real-jwt');

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden_not_admin',
      clearCookie: true,
    });
  });

  it('returns 403 actor_mismatch when actor_id does not match session', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: 'someone-else',
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    setCookie(token);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      reason: 'actor_mismatch',
      clearCookie: true,
    });
  });

  it('returns 410 target_missing when target user does not exist', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: adminId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    setCookie(token);
    setTargetUser(null);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 410,
      reason: 'target_missing',
      clearCookie: true,
    });
  });

  it('returns target user when admin impersonates a valid target', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: adminId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    setCookie(token);
    setTargetUser(targetUser);

    const result = await getEffectiveUser();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.userId).toBe(targetId);
    expect(result.actingAdminId).toBe(adminId);
    expect(result.sessionUser).toBe(adminUser);
    expect(result.client).toBe(mockAdminClient);
  });

  it('returns 403 cookie_invalid when admin presents a tampered cookie', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: adminId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    setCookie(tampered);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      reason: 'cookie_invalid',
      clearCookie: true,
    });
  });

  it('returns 403 cookie_expired when admin presents an expired cookie', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: adminId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000) - 100,
      ttlSeconds: -10,
    });
    setCookie(token);

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 403,
      reason: 'cookie_expired',
      clearCookie: true,
    });
  });

  it('returns 500 internal_error when auth.getUser throws', async () => {
    mockSessionClient.auth.getUser.mockRejectedValue(new Error('network'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 500,
      reason: 'internal_error',
      clearCookie: false,
    });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toContain('[impersonation]');
  });

  it('returns 500 internal_error when admin.getUserById throws', async () => {
    setSessionUser(adminUser);
    const token = signActingAs({
      actor_id: adminId,
      target_id: targetId,
      started_at: Math.floor(Date.now() / 1000),
    });
    setCookie(token);
    mockAdminClient.auth.admin.getUserById.mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getEffectiveUser();
    expect(result).toMatchObject({
      ok: false,
      status: 500,
      reason: 'internal_error',
      clearCookie: false,
    });
    expect(spy).toHaveBeenCalled();
  });
});
