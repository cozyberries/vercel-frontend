/**
 * VerifyNow OTP client (server-only). Use from API routes only.
 * Env: VERIFYNOW_KEY or VERIFYNOW_AUTH_TOKEN = JWT auth token (same as in curl authToken header), VERIFYNOW_CUSTOMER_ID.
 * Two APIs only: send OTP (POST), validate OTP (GET). SMS only.
 * 401 = invalid or expired token — use the exact JWT from Message Central.
 * Request timeout (default 12s) avoids FUNCTION_INVOCATION_TIMEOUT on Vercel; env VERIFYNOW_REQUEST_TIMEOUT_MS overrides.
 */

const BASE_VERIFICATION = 'https://cpaas.messagecentral.com/verification/v3';

/** Default timeout for VerifyNow API calls; keep under Vercel function limit (10s Hobby). */
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

function getRequestTimeoutMs(): number {
  const raw = process.env.VERIFYNOW_REQUEST_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 30_000) : DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * fetch with timeout so serverless doesn't hit FUNCTION_INVOCATION_TIMEOUT.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export function getVerifyNowUserMessage(message: string): { status: number; error: string } {
  if (message.includes("401") || message.includes("code: 401")) {
    return { status: 401, error: "Invalid auth. Check VERIFYNOW_KEY (use the JWT auth token from Message Central)." };
  }
  if (message.includes("code: 702")) return { status: 400, error: "Wrong OTP. Please try again." };
  if (message.includes("code: 705")) return { status: 400, error: "OTP expired. Request a new one." };
  if (message.includes("code: 800")) return { status: 429, error: "Too many attempts. Try again later." };
  if (
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("aborted") ||
    message.includes("The operation was aborted")
  ) {
    return { status: 504, error: "Request timed out. Please try again." };
  }
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

  const timeoutMs = getRequestTimeoutMs();
  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: 'POST',
      headers: { authToken: authToken } as Record<string, string>,
    },
    timeoutMs
  );

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

  const timeoutMs = getRequestTimeoutMs();
  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET',
      headers: { authToken: authToken } as Record<string, string>,
    },
    timeoutMs
  );

  if (res.ok) {
    return;
  }

  const resBody = (await res.json().catch(() => ({}))) as { code?: number };
  const codeNum = resBody.code ?? res.status;
  throw new Error(`VerifyNow validateOtp failed: ${res.status} (code: ${codeNum})`);
}
