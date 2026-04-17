import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  insertMock,
  fromMock,
  mockAdminClient,
  createAdminSupabaseClientMock,
} = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const mockAdminClient = { from: fromMock };
  const createAdminSupabaseClientMock = vi.fn(() => mockAdminClient);
  return { insertMock, fromMock, mockAdminClient, createAdminSupabaseClientMock };
});

vi.mock('@/lib/supabase-server', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}));

import {
  logImpersonationEvent,
  extractRequestMetadata,
} from './impersonation-audit';

describe('logImpersonationEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    createAdminSupabaseClientMock.mockReturnValue(mockAdminClient);
  });

  it('inserts an impersonation event with the expected shape', async () => {
    await logImpersonationEvent({
      actor_id: 'admin-1',
      target_id: 'user-2',
      event_type: 'start',
      ip: '1.2.3.4',
      user_agent: 'jest/1',
      metadata: { foo: 'bar' },
    });

    expect(fromMock).toHaveBeenCalledWith('impersonation_events');
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      target_id: 'user-2',
      event_type: 'start',
      order_id: null,
      ip: '1.2.3.4',
      user_agent: 'jest/1',
      metadata: { foo: 'bar' },
    });
  });

  it('defaults order_id, ip, user_agent, and metadata to nulls/empty object', async () => {
    await logImpersonationEvent({
      actor_id: 'admin-1',
      target_id: 'user-2',
      event_type: 'stop',
    });

    expect(insertMock).toHaveBeenCalledWith({
      actor_id: 'admin-1',
      target_id: 'user-2',
      event_type: 'stop',
      order_id: null,
      ip: null,
      user_agent: null,
      metadata: {},
    });
  });

  it('resolves without throwing when insert returns an error and logs to console.error', async () => {
    insertMock.mockResolvedValue({ error: { message: 'db down' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logImpersonationEvent({
        actor_id: 'admin-1',
        target_id: 'user-2',
        event_type: 'order_placed',
        order_id: 'order-9',
      })
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    const firstArg = spy.mock.calls[0]?.[0];
    expect(typeof firstArg).toBe('string');
    expect(firstArg as string).toContain('[impersonation]');

    spy.mockRestore();
  });

  it('resolves without throwing when the admin client factory itself throws', async () => {
    createAdminSupabaseClientMock.mockImplementation(() => {
      throw new Error('env missing');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      logImpersonationEvent({
        actor_id: 'admin-1',
        target_id: 'user-2',
        event_type: 'start',
      })
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toContain('[impersonation]');

    spy.mockRestore();
  });
});

describe('extractRequestMetadata', () => {
  it('reads ip from x-forwarded-for and user-agent', () => {
    const req = new Request('http://localhost/', {
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'user-agent': 'ua-1',
      },
    });

    expect(extractRequestMetadata(req)).toEqual({
      ip: '10.0.0.1',
      user_agent: 'ua-1',
    });
  });

  it('extracts the first ip from a comma-separated x-forwarded-for', () => {
    const req = new Request('http://localhost/', {
      headers: {
        'x-forwarded-for': '10.0.0.1, 192.168.1.1, 172.16.0.1',
        'user-agent': 'ua-2',
      },
    });

    expect(extractRequestMetadata(req)).toEqual({
      ip: '10.0.0.1',
      user_agent: 'ua-2',
    });
  });

  it('returns nulls when headers are absent', () => {
    const req = new Request('http://localhost/');
    expect(extractRequestMetadata(req)).toEqual({
      ip: null,
      user_agent: null,
    });
  });
});
