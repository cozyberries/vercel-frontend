import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const NEW_USER_ID = '00000000-0000-0000-0000-000000000099';

const {
  getUserMock,
  listUsersMock,
  createUserMock,
  generateLinkMock,
  checkRateLimitMock,
} = vi.hoisted(() => {
  return {
    getUserMock: vi.fn(),
    listUsersMock: vi.fn(),
    createUserMock: vi.fn(),
    generateLinkMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: listUsersMock,
        createUser: createUserMock,
        generateLink: generateLinkMock,
      },
    },
  })),
}));

vi.mock('@/lib/upstash', () => ({
  UpstashService: { checkRateLimit: checkRateLimitMock },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown, opts: { raw?: string } = {}) {
  return new NextRequest('http://localhost/api/admin/users/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.raw ?? JSON.stringify(body),
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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    email: 'new.user@example.com',
    phone: '9876543210',
    full_name: 'New User',
    ...overrides,
  };
}

function createdUserRow() {
  return {
    user: {
      id: NEW_USER_ID,
      email: 'new.user@example.com',
      phone: '+919876543210',
      user_metadata: { full_name: 'New User' },
      created_at: '2026-04-17T10:00:00.000Z',
    },
  };
}

function containsForbiddenField(
  value: unknown,
  forbidden: Set<string>
): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((v) => containsForbiddenField(v, forbidden));
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.has(k)) return true;
      if (containsForbiddenField(v, forbidden)) return true;
    }
  }
  return false;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 19 });
  listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
  createUserMock.mockResolvedValue({ data: createdUserRow(), error: null });
  generateLinkMock.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/admin/users/create', () => {
  it('returns 401 when unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not an admin', async () => {
    getUserMock.mockResolvedValue({
      data: { user: nonAdminUser() },
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest({}, { raw: 'not json' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
  });

  it('returns 400 for an invalid email', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(
      makeRequest(validBody({ email: 'not-an-email' }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 for a phone with fewer than 10 digits', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest(validBody({ phone: '12345' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/phone/i);
  });

  it('returns 400 when phone does not start with 6-9', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest(validBody({ phone: '1234567890' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty full_name', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest(validBody({ full_name: '   ' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when full_name exceeds 120 characters', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(
      makeRequest(validBody({ full_name: 'a'.repeat(121) }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/120/);
  });

  it('returns 409 when the email already exists', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: 'existing-1',
            email: 'new.user@example.com',
            phone: '+910000000000',
          },
        ],
      },
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: 'User already exists',
      existing_user_id: 'existing-1',
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the phone already exists in +E.164 format', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: 'existing-2',
            email: 'someone@else.com',
            phone: '+919876543210',
          },
        ],
      },
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.existing_user_id).toBe('existing-2');
  });

  it('returns 409 when the phone is stored as Supabase E.164 without leading + (e.g. 919876543210)', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: 'existing-otp',
            email: 'otp@example.com',
            phone: '919876543210',
          },
        ],
      },
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.existing_user_id).toBe('existing-otp');
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('happy path: creates user, sends magic link, returns 201 with created_at', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      user: {
        id: NEW_USER_ID,
        email: 'new.user@example.com',
        phone: '+919876543210',
        full_name: 'New User',
        created_at: '2026-04-17T10:00:00.000Z',
      },
      magic_link_sent: true,
    });
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new.user@example.com',
        phone: '+919876543210',
        email_confirm: true,
        phone_confirm: false,
        user_metadata: { full_name: 'New User' },
      })
    );
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recovery',
        email: 'new.user@example.com',
      })
    );
  });

  it('response body never contains action_link or password fields', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          action_link: 'https://example.com/recovery?token=SECRET',
        },
      },
      error: null,
    });
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();
    expect(
      containsForbiddenField(body, new Set(['action_link', 'password']))
    ).toBe(false);
  });

  it('returns 201 with magic_link_sent=false when generateLink returns an error', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    generateLinkMock.mockResolvedValue({
      data: null,
      error: { message: 'smtp down' },
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.id).toBe(NEW_USER_ID);
    expect(body.magic_link_sent).toBe(false);
    expect(typeof body.warning).toBe('string');
  });

  it('returns 201 with magic_link_sent=false when generateLink throws synchronously', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    generateLinkMock.mockRejectedValue(new Error('network kaboom'));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.id).toBe(NEW_USER_ID);
    expect(body.magic_link_sent).toBe(false);
    expect(typeof body.warning).toBe('string');
  });

  it('returns 500 when listUsers errors during duplicate detection', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    listUsersMock.mockResolvedValue({
      data: null,
      error: { message: 'list failed' },
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to verify duplicate users');
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('returns 500 when createUser errors', async () => {
    getUserMock.mockResolvedValue({ data: { user: adminUser() }, error: null });
    createUserMock.mockResolvedValue({
      data: null,
      error: { message: 'could not insert' },
    });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/could not insert|Failed to create user/);
  });
});
