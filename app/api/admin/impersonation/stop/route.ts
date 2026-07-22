import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ACTING_AS_COOKIE_NAME } from '@/lib/services/effective-user';
import { verifyActingAs } from '@/lib/utils/impersonation-cookie';
import {
  logImpersonationEvent,
  extractRequestMetadata,
} from '@/lib/services/impersonation-audit';

const LOG_PREFIX = '[impersonation]';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ACTING_AS_COOKIE_NAME)?.value;

    const sessionClient = await createServerSupabaseClient();
    let sessionUserId: string | null = null;
    try {
      const {
        data: { user },
      } = await sessionClient.auth.getUser();
      sessionUserId = user?.id ?? null;
    } catch (err) {
      console.error(`${LOG_PREFIX} stop getUser failed`, err);
      sessionUserId = null;
    }

    // No session: clear cookie defensively and succeed without audit.
    if (!sessionUserId) {
      cookieStore.delete(ACTING_AS_COOKIE_NAME);
      return NextResponse.json({ success: true });
    }

    if (cookieValue) {
      const verifyResult = verifyActingAs(cookieValue);
      if (
        verifyResult.status === 'valid' &&
        verifyResult.payload.actor_id === sessionUserId
      ) {
        const metadata = extractRequestMetadata(request);
        await logImpersonationEvent({
          actor_id: verifyResult.payload.actor_id,
          target_id: verifyResult.payload.target_id,
          event_type: 'stop',
          ip: metadata.ip,
          user_agent: metadata.user_agent,
        });
        console.log(
          `${LOG_PREFIX} stop actor=${verifyResult.payload.actor_id} target=${verifyResult.payload.target_id}`
        );
      }
    }

    cookieStore.delete(ACTING_AS_COOKIE_NAME);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`${LOG_PREFIX} stop handler error`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
