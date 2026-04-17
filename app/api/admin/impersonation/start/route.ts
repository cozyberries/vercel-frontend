import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import {
  ACTING_AS_COOKIE_NAME,
  isAdmin,
} from '@/lib/services/effective-user';
import { signActingAs } from '@/lib/utils/impersonation-cookie';
import {
  logImpersonationEvent,
  extractRequestMetadata,
} from '@/lib/services/impersonation-audit';
import { UpstashService } from '@/lib/upstash';

const LOG_PREFIX = '[impersonation]';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user: sessionUser },
      error: sessionError,
    } = await sessionClient.auth.getUser();

    if (sessionError || !sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(sessionUser)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: { target_user_id?: unknown };
    try {
      body = (await request.json()) as { target_user_id?: unknown };
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const targetUserId = body?.target_user_id;
    if (typeof targetUserId !== 'string' || !UUID_REGEX.test(targetUserId)) {
      return NextResponse.json(
        { error: 'target_user_id is required and must be a valid UUID' },
        { status: 400 }
      );
    }

    if (targetUserId === sessionUser.id) {
      return NextResponse.json(
        { error: 'Cannot impersonate yourself' },
        { status: 400 }
      );
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `impersonation_start:${sessionUser.id}`,
      30,
      3600
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const adminClient = createAdminSupabaseClient();
    const { data: targetData, error: targetError } =
      await adminClient.auth.admin.getUserById(targetUserId);

    if (targetError || !targetData?.user) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    const target = targetData.user;
    const targetEmail = target.email ?? null;
    const targetFullName =
      (target.user_metadata as { full_name?: unknown } | undefined)?.full_name;
    const fullName =
      typeof targetFullName === 'string' ? targetFullName : null;

    const now = Math.floor(Date.now() / 1000);
    const token = signActingAs({
      actor_id: sessionUser.id,
      target_id: targetUserId,
      started_at: now,
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTING_AS_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });

    const metadata = extractRequestMetadata(request);
    await logImpersonationEvent({
      actor_id: sessionUser.id,
      target_id: targetUserId,
      event_type: 'start',
      ip: metadata.ip,
      user_agent: metadata.user_agent,
      metadata: {
        target_email: targetEmail,
        target_name: fullName,
      },
    });

    console.log(
      `${LOG_PREFIX} start actor=${sessionUser.id} target=${targetUserId}`
    );

    return NextResponse.json({
      success: true,
      target: {
        id: target.id,
        email: targetEmail,
        full_name: fullName,
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} start handler error`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
