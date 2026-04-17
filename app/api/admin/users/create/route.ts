import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import { UpstashService } from '@/lib/upstash';
import {
  validateEmail,
  getIndianPhoneDigits,
} from '@/lib/utils/validation';

const LOG_PREFIX = '[admin-users-create]';

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3600;
const LIST_PER_PAGE = 1000;
const FULL_NAME_MAX = 120;

type CreateBody = {
  email?: unknown;
  phone?: unknown;
  full_name?: unknown;
};

function randomPassword(): string {
  return randomBytes(32).toString('hex');
}

function fallbackSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cozyberries.com';
}

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

    if (!isAdmin(sessionUser as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `user_create:${sessionUser.id}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    let body: CreateBody;
    try {
      body = (await request.json()) as CreateBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
    const rawPhone = typeof body.phone === 'string' ? body.phone : '';
    const rawFullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : '';

    const emailResult = validateEmail(rawEmail);
    if (!emailResult.isValid) {
      return NextResponse.json(
        { error: emailResult.error ?? 'Invalid email' },
        { status: 400 }
      );
    }

    const phoneDigits = getIndianPhoneDigits(rawPhone);
    if (phoneDigits.length !== 10) {
      return NextResponse.json(
        { error: 'Phone number must be exactly 10 digits (Indian format)' },
        { status: 400 }
      );
    }
    if (!/^[6-9]/.test(phoneDigits)) {
      return NextResponse.json(
        { error: 'Indian mobile numbers must start with 6, 7, 8, or 9' },
        { status: 400 }
      );
    }

    if (!rawFullName) {
      return NextResponse.json(
        { error: 'Full name is required' },
        { status: 400 }
      );
    }
    if (rawFullName.length > FULL_NAME_MAX) {
      return NextResponse.json(
        { error: `Full name must be ${FULL_NAME_MAX} characters or fewer` },
        { status: 400 }
      );
    }

    const normalizedEmail = rawEmail.toLowerCase();
    const normalizedPhone = `+91${phoneDigits}`;

    const adminClient = createAdminSupabaseClient();

    const { data: existingList, error: listError } =
      await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: LIST_PER_PAGE,
      });
    if (listError) {
      console.error(`${LOG_PREFIX} listUsers error`, listError);
      return NextResponse.json(
        { error: 'Failed to verify duplicate users' },
        { status: 500 }
      );
    }

    const existing = (existingList?.users ?? []).find((u) => {
      const emailMatch = (u.email ?? '').toLowerCase() === normalizedEmail;
      const phoneMatch = (u.phone ?? '') === phoneDigits ||
        (u.phone ?? '') === normalizedPhone;
      return emailMatch || phoneMatch;
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User already exists', existing_user_id: existing.id },
        { status: 409 }
      );
    }

    const { data: createData, error: createError } =
      await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        phone: normalizedPhone,
        email_confirm: true,
        phone_confirm: false,
        password: randomPassword(),
        user_metadata: { full_name: rawFullName },
      });

    if (createError || !createData?.user) {
      console.error(`${LOG_PREFIX} createUser error`, createError);
      return NextResponse.json(
        { error: createError?.message ?? 'Failed to create user' },
        { status: 500 }
      );
    }

    const created = createData.user;

    let magicLinkSent = true;
    let warning: string | undefined;
    try {
      const { error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
          options: {
            redirectTo: `${fallbackSiteUrl()}/auth/update-password`,
          },
        });
      if (linkError) {
        magicLinkSent = false;
        warning =
          'User created but password-recovery email could not be generated';
        console.error(`${LOG_PREFIX} generateLink error`, linkError);
      }
    } catch (linkErr) {
      magicLinkSent = false;
      warning =
        'User created but password-recovery email could not be generated';
      console.error(`${LOG_PREFIX} generateLink threw`, linkErr);
    }

    console.log(
      `${LOG_PREFIX} actor=${sessionUser.id} created=${created.id}`
    );

    return NextResponse.json(
      {
        user: {
          id: created.id,
          email: created.email ?? normalizedEmail,
          phone: created.phone ?? normalizedPhone,
          full_name: rawFullName,
        },
        magic_link_sent: magicLinkSent,
        ...(warning ? { warning } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} handler error`, err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
