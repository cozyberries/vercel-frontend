import { createAdminSupabaseClient } from '@/lib/supabase-server';

export type ImpersonationEventType =
  | 'start'
  | 'stop'
  | 'order_placed'
  | 'expired';

export interface LogEventInput {
  actor_id: string;
  target_id: string;
  event_type: ImpersonationEventType;
  order_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

const LOG_PREFIX = '[impersonation]';

export async function logImpersonationEvent(input: LogEventInput): Promise<void> {
  try {
    const client = createAdminSupabaseClient();

    const row = {
      actor_id: input.actor_id,
      target_id: input.target_id,
      event_type: input.event_type,
      order_id: input.order_id ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      metadata: input.metadata ?? {},
    };

    const { error } = await client.from('impersonation_events').insert(row);

    if (error) {
      console.error(`${LOG_PREFIX} Failed to insert audit event`, {
        event_type: input.event_type,
        actor_id: input.actor_id,
        target_id: input.target_id,
        error: error.message,
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Unexpected error while logging audit event`, err);
  }
}

export function extractRequestMetadata(req: Request): {
  ip: string | null;
  user_agent: string | null;
} {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const userAgent = req.headers.get('user-agent');

  const ip =
    typeof forwardedFor === 'string' && forwardedFor.length > 0
      ? (forwardedFor.split(',')[0]?.trim() ?? null) || null
      : null;

  return {
    ip,
    user_agent: userAgent && userAgent.length > 0 ? userAgent : null,
  };
}
