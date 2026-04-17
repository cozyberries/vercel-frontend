import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACTING_AS_COOKIE_NAME } from '@/lib/services/effective-user';

/**
 * Returns a 403 NextResponse when the `acting_as` cookie is present on the
 * incoming request (regardless of whether the cookie is a valid signed JWT)
 * and `undefined` otherwise.
 *
 * Identity-mutation endpoints (email change, auth-token mint, signup profile
 * init) use this to short-circuit: any presence of the cookie indicates an
 * impersonation attempt is in flight and these routes must never run under
 * that path. We deliberately do NOT verify the cookie — verification lives
 * in `getEffectiveUser` for data routes; here we want the strictest possible
 * check on the smallest possible attack surface.
 */
export async function blockIfImpersonating(): Promise<NextResponse | undefined> {
  try {
    const cookieStore = await cookies();
    const acting = cookieStore.get(ACTING_AS_COOKIE_NAME)?.value;
    if (acting) {
      return NextResponse.json(
        { error: 'Forbidden while impersonating' },
        { status: 403 }
      );
    }
    return undefined;
  } catch (err) {
    console.error('[impersonation] blockIfImpersonating cookie read failed', err);
    return undefined;
  }
}
