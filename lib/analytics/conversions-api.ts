// lib/analytics/conversions-api.ts
import { createHash } from 'crypto';

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return createHash('sha256').update(digits).digest('hex');
}

interface ConversionsEventParams {
  eventName: string;
  eventId: string;
  eventSourceUrl: string;
  userEmail?: string;
  userPhone?: string;
  clientIp?: string;
  userAgent?: string;
  customData?: Record<string, unknown>;
}

export async function sendConversionsEvent(params: ConversionsEventParams): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.FACEBOOK_CONVERSIONS_API_TOKEN;

  if (!pixelId || !token) {
    console.warn('[Meta CAPI] Missing NEXT_PUBLIC_META_PIXEL_ID or FACEBOOK_CONVERSIONS_API_TOKEN — skipping');
    return;
  }

  const userData: Record<string, unknown> = {};
  if (params.userEmail) userData.em = [sha256(params.userEmail)];
  if (params.userPhone) {
    const hashed = hashPhone(params.userPhone);
    if (hashed) userData.ph = [hashed];
  }
  if (params.clientIp) userData.client_ip_address = params.clientIp;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  const payload = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: { currency: 'INR', ...params.customData },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      console.error('[Meta CAPI] API error:', res.status, body);
    }
  } catch (err) {
    console.error('[Meta CAPI] Network error:', err);
  }
}
