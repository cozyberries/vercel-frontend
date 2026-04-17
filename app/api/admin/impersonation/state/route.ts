import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { ACTING_AS_COOKIE_NAME } from '@/lib/services/effective-user';
import { verifyActingAs } from '@/lib/utils/impersonation-cookie';
import {
  logImpersonationEvent,
  extractRequestMetadata,
} from '@/lib/services/impersonation-audit';

const LOG_PREFIX = '[impersonation]';

const inactive = () =>
  NextResponse.json({ active: false, target: null });

export async function GET(request: NextRequest) {
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
      console.error(`${LOG_PREFIX} state getUser failed`, err);
      sessionUserId = null;
    }

    if (!sessionUserId) {
      return inactive();
    }

    if (!cookieValue) {
      return inactive();
    }

    const verifyResult = verifyActingAs(cookieValue);
    if (
      verifyResult.status !== 'valid' ||
      verifyResult.payload.actor_id !== sessionUserId
    ) {
      cookieStore.delete(ACTING_AS_COOKIE_NAME);
      return inactive();
    }

    const { target_id, actor_id } = verifyResult.payload;

    const adminClient = createAdminSupabaseClient();
    const { data: targetData, error: targetError } =
      await adminClient.auth.admin.getUserById(target_id);

    if (targetError || !targetData?.user) {
      cookieStore.delete(ACTING_AS_COOKIE_NAME);
      const metadata = extractRequestMetadata(request);
      await logImpersonationEvent({
        actor_id,
        target_id,
        event_type: 'expired',
        ip: metadata.ip,
        user_agent: metadata.user_agent,
        metadata: { reason: 'target_missing' },
      });
      console.log(
        `${LOG_PREFIX} state target missing; cleared cookie actor=${actor_id} target=${target_id}`
      );
      return inactive();
    }

    const target = targetData.user;
    const fullNameRaw = (target.user_metadata as { full_name?: unknown } | undefined)
      ?.full_name;
    const fullName = typeof fullNameRaw === 'string' ? fullNameRaw : null;

    return NextResponse.json({
      active: true,
      target: {
        id: target.id,
        email: target.email ?? null,
        full_name: fullName,
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} state handler error`, err);
    return inactive();
  }
}
