import type { Connection, Credentials } from '../contracts/index.js';

export interface Session {
  token: string;
  expiresAt?: Date;
  kind: Credentials['kind'];
}

/**
 * Obtain a session for the instance.
 *
 * The admin password is used exactly once, to exchange for a JWT, and is never
 * written to disk or into an archive. Strapi rate-limits POST /admin/login
 * aggressively (five attempts per window by default), so a failed login must not
 * be retried automatically — doing so locks the user out of their own CMS.
 */
export async function authenticate(_conn: Connection): Promise<Session> {
  throw new Error('not implemented');
}

export async function refresh(_session: Session, _conn: Connection): Promise<Session> {
  throw new Error('not implemented');
}
