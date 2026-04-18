/**
 * Client-side helpers for minting the session user's JWT against
 * `POST /api/auth/generate-token`.
 *
 * The server route is fronted by `blockIfImpersonating` — whenever the
 * admin's `acting_as` cookie is present, the endpoint refuses with 403
 * "Forbidden while impersonating" regardless of which userId is in the
 * body. That is intentional: `/api/auth/generate-token` accepts an
 * arbitrary `userId` in the body without cross-checking the session, so
 * during impersonation it is a live privilege-escalation surface.
 *
 * The client therefore:
 *   1. MUST NOT call the endpoint while impersonation is active
 *      (avoids noisy 403s and prevents clobbering the admin's token).
 *   2. MUST treat a 403 returned from the endpoint as a benign signal
 *      (never a hard error) — it only means the guard caught a race
 *      where impersonation state flipped mid-flight.
 *   3. MUST preserve any previously-minted session JWT in both cases;
 *      overwriting it with null would silently break anything that
 *      relies on `jwtToken` for API auth.
 *
 * Both `requestAuthToken` and `resolveAuthToken` are pure functions
 * (no state, no React) so they can be exhaustively unit-tested without
 * a DOM or RTL setup.
 */

export type GenerateJwtReason =
  | 'impersonating'
  | 'http_error'
  | 'network_error';

export type GenerateJwtResult =
  | { ok: true; token: string }
  | { ok: false; reason: GenerateJwtReason };

export type ResolveAuthTokenAction =
  | 'minted'
  | 'skipped_impersonating'
  | 'preserved_on_server_block'
  | 'preserved_on_network_error'
  | 'failed';

export interface ResolveAuthTokenResult {
  token: string | null;
  action: ResolveAuthTokenAction;
}

export interface ResolveAuthTokenArgs {
  userId: string;
  userEmail: string | undefined;
  impersonationActive: boolean;
  previousToken: string | null;
  request: (
    userId: string,
    userEmail: string | undefined
  ) => Promise<GenerateJwtResult>;
}

const ENDPOINT = '/api/auth/generate-token';

export async function requestAuthToken(
  userId: string,
  userEmail: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<GenerateJwtResult> {
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userEmail }),
    });
  } catch {
    return { ok: false, reason: 'network_error' };
  }

  if (response.ok) {
    try {
      const data = (await response.json()) as { token?: unknown };
      if (typeof data?.token === 'string' && data.token.length > 0) {
        return { ok: true, token: data.token };
      }
      return { ok: false, reason: 'http_error' };
    } catch {
      return { ok: false, reason: 'http_error' };
    }
  }

  if (response.status === 403) {
    return { ok: false, reason: 'impersonating' };
  }

  return { ok: false, reason: 'http_error' };
}

export async function resolveAuthToken(
  args: ResolveAuthTokenArgs
): Promise<ResolveAuthTokenResult> {
  if (args.impersonationActive) {
    return {
      token: args.previousToken,
      action: 'skipped_impersonating',
    };
  }

  const result = await args.request(args.userId, args.userEmail);

  if (result.ok) {
    return { token: result.token, action: 'minted' };
  }

  if (result.reason === 'impersonating') {
    return {
      token: args.previousToken,
      action: 'preserved_on_server_block',
    };
  }

  if (result.reason === 'network_error') {
    return {
      token: args.previousToken,
      action: 'preserved_on_network_error',
    };
  }

  return { token: null, action: 'failed' };
}
