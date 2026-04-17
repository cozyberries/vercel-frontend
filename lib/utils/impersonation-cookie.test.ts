import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signActingAs, verifyActingAs } from './impersonation-cookie';

const TEST_SECRET = 'test-secret-for-vitest-do-not-use-in-prod';

describe('impersonation-cookie', () => {
  beforeEach(() => {
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips actor_id, target_id, started_at', () => {
    const started_at = Math.floor(Date.now() / 1000);
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at,
    });

    const result = verifyActingAs(token);
    expect(result).not.toBeNull();
    expect(result?.actor_id).toBe('admin-123');
    expect(result?.target_id).toBe('user-456');
    expect(result?.started_at).toBe(started_at);
    expect(typeof result?.exp).toBe('number');
    expect(result!.exp).toBeGreaterThan(started_at);
  });

  it('returns null on tampered token', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyActingAs(tampered)).toBeNull();
  });

  it('returns null on expired token', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000) - 100,
      ttlSeconds: -10,
    });

    expect(verifyActingAs(token)).toBeNull();
  });

  it('returns null when verified under a different secret', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', 'a-different-secret-for-test');
    expect(verifyActingAs(token)).toBeNull();
  });

  it('returns null on garbage input', () => {
    expect(verifyActingAs('not-a-jwt')).toBeNull();
    expect(verifyActingAs('')).toBeNull();
  });

  it('returns null when secret is missing at verify time', () => {
    const token = signActingAs({
      actor_id: 'admin-123',
      target_id: 'user-456',
      started_at: Math.floor(Date.now() / 1000),
    });

    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', '');
    expect(verifyActingAs(token)).toBeNull();
  });

  it('throws when secret is missing at sign time', () => {
    vi.stubEnv('IMPERSONATION_SIGNING_SECRET', '');
    expect(() =>
      signActingAs({
        actor_id: 'admin-123',
        target_id: 'user-456',
        started_at: Math.floor(Date.now() / 1000),
      })
    ).toThrow(/IMPERSONATION_SIGNING_SECRET/);
  });
});
