import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase-server', () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: null } })) } },
  })),
}));

import { generateAnonymousToken, verifyToken } from './jwt-auth';

const ORIGINAL = process.env.JWT_SECRET;

describe('jwt-auth secret resolution', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL;
    }
  });

  it('throws instead of falling back to a hardcoded default when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;

    expect(() => generateAnonymousToken()).toThrow(/JWT_SECRET/);
  });

  it('never accepts a token signed with the old published default secret', () => {
    process.env.JWT_SECRET = 'a-real-secret-for-this-test';
    const legacyDefault = 'your-super-secret-jwt-key-change-this-in-production';

    // Sign with the string that used to be the module's fallback.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sign } = require('jsonwebtoken');
    const forged = sign({ id: 'x', role: 'admin', isAnonymous: false }, legacyDefault);

    expect(() => verifyToken(forged)).toThrow();
  });

  it('round-trips a token when JWT_SECRET is set', () => {
    process.env.JWT_SECRET = 'a-real-secret-for-this-test';

    const token = generateAnonymousToken();
    const decoded = verifyToken(token);

    expect(decoded.isAnonymous).toBe(true);
  });
});
