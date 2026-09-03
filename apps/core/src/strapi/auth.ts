import { fetch } from 'undici';
import type { Connection, Credentials } from '../contracts/index.js';
import { StrapiHttpError, StrapiNetworkError, createAgent, joinUrl } from './http.js';

export interface Session {
  token: string;
  expiresAt?: Date;
  kind: Credentials['kind'];
}

/** Shape of a successful POST /admin/login, which is identical on v4 and v5. */
interface AdminLoginResponse {
  data?: { token?: string };
}

/**
 * Obtain a session for the instance.
 *
 * The admin password is used exactly once, to exchange for a JWT, and is never
 * written to disk or into an archive. Strapi rate-limits POST /admin/login
 * aggressively (five attempts per window by default), so a failed login must not
 * be retried automatically — doing so locks the user out of their own CMS.
 */
export async function authenticate(conn: Connection): Promise<Session> {
  if (conn.credentials.kind === 'apiToken') {
    // An API token is already a bearer credential. There is nothing to exchange,
    // and no login endpoint to rate-limit ourselves against.
    return { token: conn.credentials.token, kind: 'apiToken' };
  }

  const url = joinUrl(conn.url, '/admin/login');
  const agent = createAgent(conn);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: conn.credentials.email,
        password: conn.credentials.password,
      }),
      dispatcher: agent,
      signal: AbortSignal.timeout(conn.requestTimeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Deliberately not retried, at any status. A 429 here means the rate limit
      // has already been hit, and every further attempt extends the lockout the
      // user will run into when they next try to sign in themselves.
      if (response.status === 429) {
        throw new StrapiHttpError(
          429,
          'Too Many Requests',
          url,
          'Strapi is rate-limiting sign-in attempts. Wait for the window to pass before trying again — retrying now extends the lockout.',
        );
      }
      if (response.status === 400 || response.status === 401) {
        throw new StrapiHttpError(response.status, response.statusText, url, 'The email or password was not accepted.');
      }
      throw new StrapiHttpError(response.status, response.statusText, url, body);
    }

    const payload = (await response.json()) as AdminLoginResponse;
    const token = payload.data?.token;
    if (!token) {
      throw new StrapiHttpError(response.status, response.statusText, url, 'Sign-in succeeded but no token was returned.');
    }

    const expiresAt = expiryOf(token);
    // exactOptionalPropertyTypes: an absent expiry means omitting the key, not
    // setting it to undefined.
    return expiresAt ? { token, kind: 'admin', expiresAt } : { token, kind: 'admin' };
  } catch (error) {
    if (error instanceof StrapiHttpError) throw error;
    throw new StrapiNetworkError(url, error);
  } finally {
    await agent.close();
  }
}

/**
 * Renew an expiring session.
 *
 * Strapi issues no refresh token for admin JWTs, so renewal means signing in
 * again with the credentials already held in the connection. That is why this
 * takes the connection rather than only the session.
 */
export async function refresh(session: Session, conn: Connection): Promise<Session> {
  if (session.kind === 'apiToken') return session;
  return authenticate(conn);
}

/** True when the session has expired, or will within the next minute. */
export function isExpired(session: Session, skewMs = 60_000): boolean {
  if (!session.expiresAt) return false;
  return session.expiresAt.getTime() - skewMs <= Date.now();
}

/**
 * Read `exp` out of the JWT without verifying it.
 *
 * We are not validating the token — the instance that issued it does that. The
 * only purpose is to renew before a long backup runs past the expiry, rather
 * than discovering it as a 401 forty minutes in.
 */
function expiryOf(token: string): Date | undefined {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return undefined;
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp !== 'number') return undefined;
    return new Date(claims.exp * 1000);
  } catch {
    return undefined;
  }
}
