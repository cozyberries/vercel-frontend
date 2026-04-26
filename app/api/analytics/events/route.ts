// app/api/analytics/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendConversionsEvent } from '@/lib/analytics/conversions-api';

interface EventBody {
  eventName: 'AddToCart' | 'InitiateCheckout';
  eventId: string;
  eventSourceUrl: string;
  customData?: {
    value?: number;
    currency?: string;
    content_ids?: string[];
    num_items?: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: EventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { eventName, eventId, eventSourceUrl, customData } = body;
  const VALID_EVENTS = ['AddToCart', 'InitiateCheckout'] as const;
  if (!eventName || !VALID_EVENTS.includes(eventName) || !eventId || !eventSourceUrl) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Get user PII for hashing — optional, events fire even without auth
  let userEmail: string | undefined;
  let userPhone: string | undefined;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userEmail = user.email ?? undefined;
      userPhone = user.phone ?? undefined;
    }
  } catch {
    // Proceed without user data
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;
  const userAgent = request.headers.get('user-agent') ?? undefined;

  // Fire-and-forget — never let analytics failure affect the response
  sendConversionsEvent({
    eventName,
    eventId,
    eventSourceUrl,
    userEmail,
    userPhone,
    clientIp,
    userAgent,
    customData: { currency: 'INR', ...customData },
  }).catch((err) => console.error('[Meta CAPI route] Unhandled error:', err));

  return NextResponse.json({ ok: true });
}
