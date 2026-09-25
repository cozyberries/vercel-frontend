/**
 * Admin creation of a customer account, gated on an OTP the customer reads
 * out at the counter (sent by /api/admin/users/send-otp). The phone is
 * therefore verified, so the account is created with phone_confirm: true.
 * No session is ever minted for the new user: the admin stays logged in as
 * the admin and continues via impersonation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import { UpstashService } from '@/lib/upstash';
import { getAuthTokenFromEnv, validateOtp } from '@/lib/verifynow';
import {
  findExistingUser,
  parseNewCustomer,
} from '@/lib/services/admin-customer-accounts';

const LOG_PREFIX = '[admin-users-create]';

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3600;

type CreateBody = {
  email?: unknown;
  phone?: unknown;
  full_name?: unknown;
  verification_id?: unknown;
  otp_code?: unknown;
};

function randomPassword(): string {
  return randomBytes(32).toString('hex');
}

function resolveSiteUrl(): string {
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

    const parsed = parseNewCustomer(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { rawEmail, normalizedEmail, phoneDigits, fullName } = parsed.value;
    const normalizedPhone = `+91${phoneDigits}`;

    const verificationId =
      typeof body.verification_id === 'string' ? body.verification_id.trim() : '';
    const otpCode = typeof body.otp_code === 'string' ? body.otp_code.trim() : '';
    if (!verificationId || !otpCode) {
      return NextResponse.json(
        { error: "Verify the customer's phone with an OTP first" },
        { status: 400 }
      );
    }

    const adminClient = createAdminSupabaseClient() as SupabaseClient;

    let existing: User | null;
    try {
      existing = await findExistingUser(adminClient, normalizedEmail, phoneDigits);
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

    try {
      await validateOtp(getAuthTokenFromEnv(), phoneDigits, verificationId, otpCode);
    } catch (otpError) {
      console.warn(`${LOG_PREFIX} OTP rejected`, otpError instanceof Error ? otpError.message : otpError);
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
    }

    const { data: createData, error: createError } =
      await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        phone: normalizedPhone,
        email_confirm: true,
        phone_confirm: true,
        password: randomPassword(),
        user_metadata: { full_name: fullName },
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
          full_name: fullName,
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
