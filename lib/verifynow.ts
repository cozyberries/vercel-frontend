/**
 * VerifyNow OTP client (server-only). Use from API routes only.
 * Env: VERIFYNOW_CUSTOMER_ID, VERIFYNOW_KEY.
 */

const BASE_AUTH = 'https://cpaas.messagecentral.com/auth/v1/authentication/token';
const BASE_VERIFICATION = 'https://cpaas.messagecentral.com/verification/v3';

export type VerifyNowFlowType = 'SMS' | 'WHATSAPP';

interface AuthTokenResponse {
  data?: { authToken?: string };
  authToken?: string;
}

/**
 * Fetch auth token from VerifyNow. Throws on non-200 or missing token.
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

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`VerifyNow getAuthToken failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as AuthTokenResponse;
  const token = body.data?.authToken ?? body.authToken;
  if (!token || typeof token !== 'string') {
    throw new Error('VerifyNow getAuthToken: missing authToken in response');
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
 */
export async function sendOtp(
  authToken: string,
  mobileNumber: string,
  flowType: VerifyNowFlowType
): Promise<{ verificationId: string }> {
  const normalized = normalizeMobileNumber(mobileNumber);
  const url = new URL(`${BASE_VERIFICATION}/send`);
  url.searchParams.set('countryCode', '91');
  url.searchParams.set('flowType', flowType);
  url.searchParams.set('mobileNumber', normalized);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      authToken,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json().catch(() => ({})) as { data?: { verificationId?: string }; verificationId?: string };
  const verificationId = body.data?.verificationId ?? body.verificationId;

  if (!res.ok) {
    const code = (body as { code?: number }).code ?? res.status;
    throw new Error(`VerifyNow sendOtp failed: ${res.status} (code: ${code})`);
  }
  if (!verificationId || typeof verificationId !== 'string') {
    throw new Error('VerifyNow sendOtp: missing verificationId in response');
  }
  return { verificationId };
}

/**
 * Validate OTP. Returns void on success; throws on error with response code.
 */
export async function validateOtp(
  authToken: string,
  verificationId: string,
  code: string,
  flowType: VerifyNowFlowType
): Promise<void> {
  const url = new URL(`${BASE_VERIFICATION}/validateOtp`);
  url.searchParams.set('verificationId', verificationId);
  url.searchParams.set('code', code);
  url.searchParams.set('flowType', flowType);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      authToken,
      'Content-Type': 'application/json',
    },
  });

  if (res.ok) {
    return;
  }

  const body = await res.json().catch(() => ({})) as { code?: number };
  const codeNum = body.code ?? res.status;
  throw new Error(`VerifyNow validateOtp failed: ${res.status} (code: ${codeNum})`);
}
