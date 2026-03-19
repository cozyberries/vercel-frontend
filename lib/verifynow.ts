/**
 * VerifyNow OTP client (server-only). Use from API routes only.
 * Env: VERIFYNOW_CUSTOMER_ID, VERIFYNOW_KEY.
 */

import { appendFileSync } from 'fs';
import { join } from 'path';

const DEBUG_LOG = join(process.cwd(), '.cursor', 'debug-eb0f9c.log');
function debugLog(payload: Record<string, unknown>) {
  try {
    appendFileSync(DEBUG_LOG, JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n');
  } catch {
    // ignore
  }
}

const BASE_AUTH = 'https://cpaas.messagecentral.com/auth/v1/authentication/token';
const BASE_VERIFICATION = 'https://cpaas.messagecentral.com/verification/v3';

export type VerifyNowFlowType = 'SMS' | 'WHATSAPP';

/**
 * Map VerifyNow error message (from thrown Error) to user-facing message and HTTP status.
 * Used by send and verify API routes.
 */
export function getVerifyNowUserMessage(message: string): { status: number; error: string } {
  if (message.includes("code: 702")) return { status: 400, error: "Wrong OTP. Please try again." };
  if (message.includes("code: 705")) return { status: 400, error: "OTP expired. Request a new one." };
  if (message.includes("code: 800")) return { status: 429, error: "Too many attempts. Try again later." };
  if (
    message.includes("501") ||
    message.includes("505") ||
    message.includes("506") ||
    message.includes("511") ||
    message.includes("code: 5")
  ) {
    return { status: 502, error: "Something went wrong. Please try again." };
  }
  return { status: 502, error: "Something went wrong. Please try again." };
}

// Token API: success has token in data or top-level; error returns { error: string } (sometimes with 200)
type AuthTokenResponse = {
  data?: {
    authToken?: string;
    token?: string;
    accessToken?: string;
    access_token?: string;
    jwt?: string;
  };
  authToken?: string;
  token?: string;
  access_token?: string;
  error?: string;
};

/**
 * Fetch auth token from VerifyNow. Throws on non-200, error payload, or missing token.
 * Uses GET with customerId, key, scope=NEW, country=91; optional email in query.
 */
export async function getAuthToken(): Promise<string> {
  const customerId = process.env.VERIFYNOW_CUSTOMER_ID;
  const key = process.env.VERIFYNOW_KEY;
  if (!customerId || !key) {
    throw new Error('VerifyNow: VERIFYNOW_CUSTOMER_ID and VERIFYNOW_KEY are required');
  }
  const url = new URL(BASE_AUTH);
  url.searchParams.set('customerId', customerId);
  url.searchParams.set('key', key);
  url.searchParams.set('scope', 'NEW');
  url.searchParams.set('country', '91');
  const email = process.env.VERIFYNOW_EMAIL;
  if (email) url.searchParams.set('email', email);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { accept: '*/*' },
  });
  const body = (await res.json().catch(() => ({}))) as AuthTokenResponse;

  if (!res.ok) {
    const msg = body.error || res.statusText;
    throw new Error(`VerifyNow getAuthToken failed: ${res.status} ${msg}`);
  }

  if (body.error && typeof body.error === 'string') {
    throw new Error(`VerifyNow token API error: ${body.error}`);
  }

  const token =
    body.data?.authToken ??
    body.data?.token ??
    body.data?.accessToken ??
    body.data?.access_token ??
    body.data?.jwt ??
    body.authToken ??
    body.token ??
    body.access_token;
  if (!token || typeof token !== 'string') {
    const hint =
      process.env.NODE_ENV === 'development'
        ? ` Response keys: ${JSON.stringify(Object.keys(body))}. data keys: ${body.data ? JSON.stringify(Object.keys(body.data)) : 'none'}.`
        : '';
    throw new Error('VerifyNow getAuthToken: missing authToken in response.' + hint);
  }
  return token;
}

/**
 * Normalize mobile number to digits only.
 */
function normalizeMobileNumber(mobileNumber: string): string {
  return mobileNumber.replace(/\D/g, '');
}

/**
 * Send OTP. Returns verificationId. Throws on error with response code if available.
 * VerifyNow: POST /verification/v3/send with URL params (countryCode, flowType, mobileNumber, customerId) and header authToken.
 */
export async function sendOtp(
  authToken: string,
  mobileNumber: string,
  flowType: VerifyNowFlowType
): Promise<{ verificationId: string }> {
  const customerId = process.env.VERIFYNOW_CUSTOMER_ID;
  if (!customerId) {
    throw new Error('VerifyNow: VERIFYNOW_CUSTOMER_ID is required for send');
  }
  const normalized = normalizeMobileNumber(mobileNumber);
  const url = new URL(`${BASE_VERIFICATION}/send`);
  url.searchParams.set('countryCode', '91');
  url.searchParams.set('flowType', flowType);
  url.searchParams.set('mobileNumber', normalized);
  url.searchParams.set('customerId', customerId);

  const headers = new Headers();
  headers.set('authToken', authToken);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
  });

  const resBody = (await res.json().catch(() => ({}))) as {
    data?: { verificationId?: string | number };
    verificationId?: string | number;
    code?: number;
  };
  const raw = resBody.data?.verificationId ?? resBody.verificationId;

  if (!res.ok) {
    const code = resBody.code ?? res.status;
    throw new Error(`VerifyNow sendOtp failed: ${res.status} (code: ${code})`);
  }
  if (raw === undefined || raw === null) {
    throw new Error('VerifyNow sendOtp: missing verificationId in response');
  }
  const verificationId = typeof raw === 'string' ? raw : String(raw);
  return { verificationId };
}

/**
 * Validate OTP. Returns void on success; throws on error with response code.
 * VerifyNow: POST /verification/v3/validateOtp/ with URL params (verificationId, code, flowType, optional langid) and header authToken.
 */
export async function validateOtp(
  authToken: string,
  verificationId: string,
  code: string,
  flowType: VerifyNowFlowType,
  langid?: string
): Promise<void> {
  const url = new URL(`${BASE_VERIFICATION}/validateOtp/`);
  url.searchParams.set('verificationId', verificationId);
  url.searchParams.set('code', code);
  url.searchParams.set('flowType', flowType);
  if (langid != null && langid.trim() !== '') {
    url.searchParams.set('langid', langid.trim());
  }

  const headers = new Headers();
  headers.set('authToken', authToken);

  // #region agent log
  debugLog({ sessionId: 'eb0f9c', location: 'verifynow.ts:validateOtp:beforeFetch', message: 'validateOtp request', data: { url: url.toString(), authTokenLen: authToken.length, hasAuthHeader: true }, hypothesisId: 'H2,H4,H5' });
  fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verifynow.ts:validateOtp:beforeFetch',message:'validateOtp request',data:{url:url.toString(),authTokenLen:authToken.length,hasAuthHeader:true},timestamp:Date.now(),hypothesisId:'H2,H4,H5'})}).catch(()=>{});
  // #endregion

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
  });

  // #region agent log
  debugLog({ sessionId: 'eb0f9c', location: 'verifynow.ts:validateOtp:afterFetch', message: 'validateOtp response', data: { status: res.status }, hypothesisId: 'H3,H4,H5' });
  fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verifynow.ts:validateOtp:afterFetch',message:'validateOtp response',data:{status:res.status},timestamp:Date.now(),hypothesisId:'H3,H4,H5'})}).catch(()=>{});
  // #endregion

  if (res.ok) {
    return;
  }

  const resBody = (await res.json().catch(() => ({}))) as { code?: number };
  const codeNum = resBody.code ?? res.status;
  throw new Error(`VerifyNow validateOtp failed: ${res.status} (code: ${codeNum})`);
}
