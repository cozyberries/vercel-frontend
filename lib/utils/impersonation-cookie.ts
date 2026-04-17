import jwt from 'jsonwebtoken';

export interface ActingAsPayload {
  actor_id: string;
  target_id: string;
  started_at: number;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 2;

function readSecret(): string {
  const secret = process.env.IMPERSONATION_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      'IMPERSONATION_SIGNING_SECRET is not set. Configure a 32+ byte random secret before signing impersonation cookies.'
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

export function verifyActingAs(token: string): ActingAsPayload | null {
  if (!token || typeof token !== 'string') return null;

  const secret = process.env.IMPERSONATION_SIGNING_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!decoded || typeof decoded !== 'object') return null;

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
      return null;
    }

    return { actor_id, target_id, started_at, exp };
  } catch {
    return null;
  }
}
