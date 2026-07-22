import jwt from 'jsonwebtoken';

export interface ActingAsPayload {
  actor_id: string;
  target_id: string;
  started_at: number;
  exp: number;
}

export type VerifyResult =
  | { status: 'valid'; payload: ActingAsPayload }
  | { status: 'expired' }
  | { status: 'invalid' };

const DEFAULT_TTL_SECONDS = 60 * 60 * 2;
const MIN_SECRET_LENGTH = 32;

let missingSecretWarned = false;

function readSecret(): string {
  const secret = process.env.IMPERSONATION_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      'IMPERSONATION_SIGNING_SECRET is not set. Configure a 32+ byte random secret before signing impersonation cookies.'
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `IMPERSONATION_SIGNING_SECRET must be at least ${MIN_SECRET_LENGTH} characters`
    );
  }
  return secret;
}

export function signActingAs(
  payload: Omit<ActingAsPayload, 'exp'> & { ttlSeconds?: number }
): string {
  const secret = readSecret();
  const { actor_id, target_id, started_at, ttlSeconds } = payload;
  const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : DEFAULT_TTL_SECONDS;

  return jwt.sign(
    { actor_id, target_id, started_at },
    secret,
    { algorithm: 'HS256', expiresIn: ttl }
  );
}

export function verifyActingAs(token: string): VerifyResult {
  if (!token || typeof token !== 'string') return { status: 'invalid' };

  const secret = process.env.IMPERSONATION_SIGNING_SECRET;
  if (!secret) {
    if (!missingSecretWarned) {
      missingSecretWarned = true;
      console.warn(
        '[impersonation] IMPERSONATION_SIGNING_SECRET is missing; impersonation verification is disabled'
      );
    }
    return { status: 'invalid' };
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!decoded || typeof decoded !== 'object') return { status: 'invalid' };

    const { actor_id, target_id, started_at, exp } = decoded as Record<
      string,
      unknown
    >;

    if (
      typeof actor_id !== 'string' ||
      typeof target_id !== 'string' ||
      typeof started_at !== 'number' ||
      typeof exp !== 'number'
    ) {
      return { status: 'invalid' };
    }

    return {
      status: 'valid',
      payload: { actor_id, target_id, started_at, exp },
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { status: 'expired' };
    }
    return { status: 'invalid' };
  }
}

// Exposed for tests; resets the once-per-process warning guard.
export function __resetMissingSecretWarningForTests(): void {
  missingSecretWarned = false;
}
