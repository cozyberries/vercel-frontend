/**
 * VerifyNow OTP client (server-only). Use from API routes only.
 * Env: VERIFYNOW_KEY or VERIFYNOW_AUTH_TOKEN = JWT auth token (same as in curl authToken header), VERIFYNOW_CUSTOMER_ID.
 * Two APIs only: send OTP (POST), validate OTP (GET). SMS only.
 * 401 = invalid or expired token — use the exact JWT from Message Central.
 */

const BASE_VERIFICATION = 'https://cpaas.messagecentral.com/verification/v3';

export function getVerifyNowUserMessage(message: string): { status: number; error: string } {
  if (message.includes("401") || message.includes("code: 401")) {
    return { status: 401, error: "Invalid auth. Check VERIFYNOW_KEY (use the JWT auth token from Message Central)." };
  }
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

/**
 * Auth token from env. Use the same value as in the working curl (JWT in authToken header).
 * Throws if not set.
 */
export function getAuthTokenFromEnv(): string {
  const token = process.env.VERIFYNOW_KEY?.trim() || process.env.VERIFYNOW_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error('VerifyNow: VERIFYNOW_KEY or VERIFYNOW_AUTH_TOKEN is required (JWT auth token from Message Central)');
  }
  return token;
}

function normalizeMobileNumber(mobileNumber: string): string {
  return mobileNumber.replace(/\D/g, '');
}

/**
 * Send OTP (SMS only). POST .../v3/send with countryCode, customerId, flowType=SMS, mobileNumber.
 * Returns verificationId.
 */
export async function sendOtp(
  authToken: string,
  mobileNumber: string
): Promise<{ verificationId: string }> {
  const customerId = process.env.VERIFYNOW_CUSTOMER_ID;
  if (!customerId) {
    throw new Error('VerifyNow: VERIFYNOW_CUSTOMER_ID is required for send');
  }
  const normalized = normalizeMobileNumber(mobileNumber);
  const url = new URL(`${BASE_VERIFICATION}/send`);
  url.searchParams.set('countryCode', '91');
  url.searchParams.set('customerId', customerId);
  url.searchParams.set('flowType', 'SMS');
  url.searchParams.set('mobileNumber', normalized);

  // Use exact header name 'authToken' (some APIs are case-sensitive)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { authToken: authToken } as Record<string, string>,
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
 * Validate OTP. GET .../v3/validateOtp with countryCode, mobileNumber, verificationId, customerId, code.
 */
export async function validateOtp(
  authToken: string,
  mobileNumber: string,
  verificationId: string,
  code: string
): Promise<void> {
  const customerId = process.env.VERIFYNOW_CUSTOMER_ID;
  if (!customerId) {
    throw new Error('VerifyNow: VERIFYNOW_CUSTOMER_ID is required for validate');
  }
  const normalized = normalizeMobileNumber(mobileNumber);
  const url = new URL(`${BASE_VERIFICATION}/validateOtp`);
  url.searchParams.set('countryCode', '91');
  url.searchParams.set('mobileNumber', normalized);
  url.searchParams.set('verificationId', verificationId);
  url.searchParams.set('customerId', customerId);
  url.searchParams.set('code', code);

  // Use exact header name 'authToken' (some APIs are case-sensitive)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { authToken: authToken } as Record<string, string>,
  });

  if (res.ok) {
    return;
  }

  const resBody = (await res.json().catch(() => ({}))) as { code?: number };
  const codeNum = resBody.code ?? res.status;
  throw new Error(`VerifyNow validateOtp failed: ${res.status} (code: ${codeNum})`);
}
