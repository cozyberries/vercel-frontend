/**
 * Admin user creation with duplicate detection.
 *
 * Implementation note: we page through `supabase.auth.admin.listUsers` with a
 * hard cap and short-circuit on the first match. Direct `auth.users` SELECTs
 * are not exposed via PostgREST here, so paging is the safest portable
 * option. The single-page listUsers() call used in Phase 5 silently missed
 * users past the first 1000 rows — that caused createUser to collide and
 * surface a 500 instead of the expected 409.
 *
 * TODO(perf): swap to a direct SQL lookup once `auth.users` SELECT access
 * is confirmed in this Supabase project.
 */
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
import type { SupabaseClient, User } from '@supabase/supabase-js';

const LOG_PREFIX = '[admin-users-create]';

const PHONE_PLACEHOLDER_DOMAIN =
  process.env.VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN ||
  'phone.cozyberries.local';

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3600;
const LIST_PER_PAGE = 1000;
const MAX_PAGES = 20;
const FULL_NAME_MAX = 120;

type CreateBody = {
  email?: unknown;
  phone?: unknown;
  full_name?: unknown;
};

function randomPassword(): string {
  return randomBytes(32).toString('hex');
}

function resolveSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cozyberries.com';
}

/**
 * Normalized set of phone representations Supabase may have stored:
 *  - bare 10 digits (legacy)
 *  - E.164 without leading `+` (default Supabase storage, e.g. `919876543210`)
 *  - E.164 with `+` (some flows, e.g. `+919876543210`)
 */
function phoneCandidates(digits: string): Set<string> {
  const e164NoPlus = `91${digits}`;
  return new Set([digits, e164NoPlus, `+${e164NoPlus}`]);
}

async function findDuplicate(
  adminClient: SupabaseClient,
  normalizedEmail: string,
  phoneDigits: string
): Promise<User | null> {
  const phones = phoneCandidates(phoneDigits);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: LIST_PER_PAGE,
    });

    if (error) {
      throw error;
    }

    const batch = (data?.users ?? []) as User[];
    for (const user of batch) {
      const emailMatch =
        (user.email ?? '').toLowerCase() === normalizedEmail;
      const phoneMatch = phones.has(user.phone ?? '');
      if (emailMatch || phoneMatch) {
        return user;
      }
    }

    if (batch.length < LIST_PER_PAGE) {
      return null;
    }
    if (page === MAX_PAGES) {
      console.warn(
        `${LOG_PREFIX} hit MAX_PAGES=${MAX_PAGES} during duplicate scan; accepting best-effort result`
      );
    }
  }

  return null;
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

    if (!isAdmin(sessionUser)) {
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

    if (rawEmail) {
      const emailResult = validateEmail(rawEmail);
      if (!emailResult.isValid) {
        return NextResponse.json(
          { error: emailResult.error ?? 'Invalid email' },
          { status: 400 }
        );
      }
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

    const normalizedEmail = rawEmail
      ? rawEmail.toLowerCase()
      : `${phoneDigits}@${PHONE_PLACEHOLDER_DOMAIN}`;
    const normalizedPhone = `+91${phoneDigits}`;

    const adminClient = createAdminSupabaseClient() as SupabaseClient;

    let existing: User | null;
    try {
      existing = await findDuplicate(
        adminClient,
        normalizedEmail,
        phoneDigits
      );
    } catch (listError) {
      console.error(`${LOG_PREFIX} listUsers error`, listError);
      return NextResponse.json(
        { error: 'Failed to verify duplicate users' },
        { status: 500 }
      );
    }

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

    const created = createData.user as User;

    let magicLinkSent = false;
    let warning: string | undefined;
    if (rawEmail) {
      magicLinkSent = true;
      try {
        const { error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: {
              redirectTo: `${resolveSiteUrl()}/auth/update-password`,
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
          created_at: created.created_at,
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
