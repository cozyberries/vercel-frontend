import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  signActingAs,
  verifyActingAs,
  __resetMissingSecretWarningForTests,
} from './impersonation-cookie';

const TEST_SECRET = 'test-secret-for-vitest-do-not-use-in-prod';

describe('impersonation-cookie', () => {
  beforeEach(() => {
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', TEST_SECRET);
    __resetMissingSecretWarningForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('round-trips actor_id, target_id, started_at on a valid token', () => {
    const started_at = Math.floor(Date.now() / 1000);
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at,
    });

    const result = verifyActingAs(token);
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.payload.actor_id).toBe('admin-123');
    expect(result.payload.target_id).toBe('user-456');
    expect(result.payload.started_at).toBe(started_at);
    expect(typeof result.payload.exp).toBe('number');
    expect(result.payload.exp).toBeGreaterThan(started_at);
  });

  it('returns { status: "invalid" } on tampered token', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyActingAs(tampered)).toEqual({ status: 'invalid' });
  });

  it('returns { status: "expired" } when the token is expired', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000) - 100,
      ttlSeconds: -10,
    });

    expect(verifyActingAs(token)).toEqual({ status: 'expired' });
  });

  it('returns { status: "invalid" } when verified under a different secret', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    vi.stubEnv(
      'IMPERSONATION_SIGNING_SECRET',
      'a-different-secret-that-is-long-enough-32'
    );
    expect(verifyActingAs(token)).toEqual({ status: 'invalid' });
  });

  it('returns { status: "invalid" } on garbage input', () => {
    expect(verifyActingAs('not-a-jwt')).toEqual({ status: 'invalid' });
    expect(verifyActingAs('')).toEqual({ status: 'invalid' });
  });

  it('returns { status: "invalid" } and warns once when secret is missing at verify time', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', '');
    expect(verifyActingAs(token)).toEqual({ status: 'invalid' });
    expect(verifyActingAs(token)).toEqual({ status: 'invalid' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('[impersonation]');
  });

  it('throws when secret is missing at sign time', () => {
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', '');
    expect(() =>
      signActingAs({
        actor_id: 'admin-123',
        target_id: 'user-456',
        started_at: Math.floor(Date.now() / 1000),
      })
    ).toThrow(/IMPERSONATION_SIGNING_SECRET is not set/);
  });

  it('throws when secret is shorter than 32 characters at sign time', () => {
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', 'too-short');
    expect(() =>
      signActingAs({
        actor_id: 'admin-123',
        target_id: 'user-456',
        started_at: Math.floor(Date.now() / 1000),
      })
    ).toThrow(/at least 32 characters/);
  });
});
