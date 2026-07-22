import { describe, expect, it, vi } from 'vitest';
import {
  requestAuthToken,
  resolveAuthToken,
  type GenerateJwtResult,
} from './generate-jwt-token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('requestAuthToken', () => {
  it('returns { ok: true, token } on 200 with a token payload', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ token: 'jwt-abc', success: true }, 200));
    const result = await requestAuthToken('u1', 'u1@example.com', fetchMock);
    expect(result).toEqual({ ok: true, token: 'jwt-abc' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/generate-token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('returns { ok: false, reason: "impersonating" } on 403 "Forbidden while impersonating"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ error: 'Forbidden while impersonating' }, 403)
      );
    const result = await requestAuthToken('u1', 'u1@example.com', fetchMock);
    expect(result).toEqual({ ok: false, reason: 'impersonating' });
  });

  it('returns { ok: false, reason: "http_error" } on other non-OK status codes', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    const result = await requestAuthToken('u1', undefined, fetchMock);
    expect(result).toEqual({ ok: false, reason: 'http_error' });
  });

  it('returns { ok: false, reason: "http_error" } when 200 body is missing a token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true }, 200));
    const result = await requestAuthToken('u1', undefined, fetchMock);
    expect(result).toEqual({ ok: false, reason: 'http_error' });
  });

  it('returns { ok: false, reason: "network_error" } when fetch throws', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'));
    const result = await requestAuthToken('u1', undefined, fetchMock);
    expect(result).toEqual({ ok: false, reason: 'network_error' });
  });
});

describe('resolveAuthToken', () => {
  const baseArgs = {
    userId: 'u1',
    userEmail: 'u1@example.com',
    previousToken: 'prev-token',
  } as const;

  it('skips the HTTP mint when impersonation is active and preserves the previous token', async () => {
    const request = vi.fn<
      (userId: string, userEmail: string | undefined) => Promise<GenerateJwtResult>
    >();
    const result = await resolveAuthToken({
      ...baseArgs,
      impersonationActive: true,
      request,
    });
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({
      token: 'prev-token',
      action: 'skipped_impersonating',
    });
  });

  it('mints a fresh token when impersonation is inactive and server returns 200', async () => {
    const request = vi
      .fn<
        (userId: string, userEmail: string | undefined) => Promise<GenerateJwtResult>
      >()
      .mockResolvedValue({ ok: true, token: 'fresh' });
    const result = await resolveAuthToken({
      ...baseArgs,
      impersonationActive: false,
      request,
    });
    expect(request).toHaveBeenCalledWith('u1', 'u1@example.com');
    expect(result).toEqual({ token: 'fresh', action: 'minted' });
  });

  it('preserves the previous token (does NOT null it out) if the server races and returns 403', async () => {
    const request = vi
      .fn<
        (userId: string, userEmail: string | undefined) => Promise<GenerateJwtResult>
      >()
      .mockResolvedValue({ ok: false, reason: 'impersonating' });
    const result = await resolveAuthToken({
      ...baseArgs,
      impersonationActive: false,
      request,
    });
    expect(result).toEqual({
      token: 'prev-token',
      action: 'preserved_on_server_block',
    });
  });

  it('clears the token on http_error so broken tokens are not reused', async () => {
    const request = vi
      .fn<
        (userId: string, userEmail: string | undefined) => Promise<GenerateJwtResult>
      >()
      .mockResolvedValue({ ok: false, reason: 'http_error' });
    const result = await resolveAuthToken({
      ...baseArgs,
      impersonationActive: false,
      request,
    });
    expect(result).toEqual({ token: null, action: 'failed' });
  });

  it('preserves the previous token on a transient network_error', async () => {
    const request = vi
      .fn<
        (userId: string, userEmail: string | undefined) => Promise<GenerateJwtResult>
      >()
      .mockResolvedValue({ ok: false, reason: 'network_error' });
    const result = await resolveAuthToken({
      ...baseArgs,
      impersonationActive: false,
      request,
    });
    expect(result).toEqual({
      token: 'prev-token',
      action: 'preserved_on_network_error',
    });
  });
});
