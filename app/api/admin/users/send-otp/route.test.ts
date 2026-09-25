import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  checkRateLimit: vi.fn(),
  sendOtp: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: h.getUser } })),
  createAdminSupabaseClient: vi.fn(() => ({ auth: { admin: { listUsers: h.listUsers, createUser: h.createUser } } })),
}));
vi.mock('@/lib/upstash', () => ({ UpstashService: { checkRateLimit: h.checkRateLimit } }));
vi.mock('@/lib/verifynow', () => ({
  getAuthTokenFromEnv: () => 'tok',
  sendOtp: h.sendOtp,
  getVerifyNowUserMessage: () => ({ status: 502, error: 'OTP service unavailable' }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/admin/users/send-otp', { method: 'POST', body: JSON.stringify(body) });
const admin = { id: 'admin-1', email: 'admin@cozyberries.in', app_metadata: { role: 'admin' } };
const body = { phone: '9876543210', full_name: 'Asha Rao' };

beforeEach(() => {
  vi.clearAllMocks();
  h.getUser.mockResolvedValue({ data: { user: admin }, error: null });
  h.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  h.checkRateLimit.mockResolvedValue({ allowed: true });
  h.sendOtp.mockResolvedValue({ verificationId: 'vid-1' });
});

describe('POST /api/admin/users/send-otp', () => {
  it('requires a session', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req(body))).status).toBe(401);
  });

  it('requires an admin', async () => {
    h.getUser.mockResolvedValue({ data: { user: { ...admin, app_metadata: { role: 'customer' } } }, error: null });
    expect((await POST(req(body))).status).toBe(403);
    expect(h.sendOtp).not.toHaveBeenCalled();
  });

  it('validates the phone before sending anything', async () => {
    const res = await POST(req({ ...body, phone: '12345' }));
    expect(res.status).toBe(400);
    expect(h.sendOtp).not.toHaveBeenCalled();
  });

  it('points staff at the existing account instead of sending an OTP', async () => {
    h.listUsers.mockResolvedValue({ data: { users: [{ id: 'existing-1', phone: '919876543210', email: 'x@y.z' }] }, error: null });
    const res = await POST(req(body));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Customer already has an account', existing_user_id: 'existing-1' });
    expect(h.sendOtp).not.toHaveBeenCalled();
  });

  it('rate-limits per phone number', async () => {
    h.checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req(body));
    expect(res.status).toBe(429);
    expect(h.checkRateLimit).toHaveBeenCalledWith('otp_send:9876543210', 5, 900);
  });

  it('sends the OTP and returns the verification id without creating anyone', async () => {
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verificationId: 'vid-1', timeout: 60 });
    expect(h.sendOtp).toHaveBeenCalledWith('tok', '9876543210');
    expect(h.createUser).not.toHaveBeenCalled();
  });
});
