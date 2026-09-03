import type { Connection, StrapiVersion } from '../contracts/index.js';
import type { StrapiDialect } from './contracts.js';
import { authenticate } from './auth.js';
import type { Session } from './auth.js';
import { StrapiHttpClient } from './client.js';
import { StrapiHttpError } from './http.js';
import { StrapiV4Dialect } from './v4/index.js';
import { StrapiV5Dialect } from './v5/index.js';

/**
 * Work out which dialect an instance speaks, before anything else happens.
 *
 * Strapi does not advertise its major version on an unauthenticated endpoint in
 * any dependable way, so this probes behaviour rather than trusting a version
 * string: the shape of a Content-Type Builder response distinguishes v4 from v5
 * reliably, where a version banner may be absent, proxied away, or wrong.
 */
export async function detectVersion(conn: Connection): Promise<StrapiVersion> {
  const session = await authenticate(conn);
  const http = new StrapiHttpClient(conn, session);
  try {
    return await detectWith(http);
  } finally {
    await http.dispose();
  }
}

/** The detection itself, against a client that is already authenticated. */
export async function detectWith(http: StrapiHttpClient): Promise<StrapiVersion> {
  // GET /admin/information is authoritative when the credentials can reach it,
  // which is every admin session. It is checked first because it is one request
  // and cannot be fooled by an instance that happens to hold no records.
  try {
    const info = await http.get<{ data?: { strapiVersion?: string } }>('/admin/information');
    const version = info.data?.strapiVersion;
    const major = version ? Number(version.split('.')[0]) : NaN;
    if (major >= 5) return 'v5';
    if (major === 4) return 'v4';
  } catch (error) {
    // An API token cannot read /admin/information, and a reverse proxy may hide
    // it. Neither is fatal — fall through to the behavioural check.
    if (!(error instanceof StrapiHttpError)) throw error;
  }

  // Behavioural fallback: v5 identifies records by `documentId` and v4 has no
  // such field. This is checked against a real payload rather than a banner,
  // because a version string can be absent, proxied away, or simply wrong.
  const shape = await probeRecordShape(http);
  if (shape !== 'unknown') return shape;

  throw new Error(
    'Could not determine whether this instance is Strapi v4 or v5. The version endpoint was unreachable and the instance holds no records to inspect.',
  );
}

async function probeRecordShape(http: StrapiHttpClient): Promise<StrapiVersion | 'unknown'> {
  interface CtbEntry {
    uid: string;
    schema?: { kind?: string; visible?: boolean };
  }

  let types: CtbEntry[];
  try {
    const response = await http.get<{ data: CtbEntry[] }>('/content-type-builder/content-types');
    types = response.data;
  } catch {
    return 'unknown';
  }

  const candidates = types.filter(
    (entry) => entry.schema?.kind === 'collectionType' && entry.uid.startsWith('api::'),
  );

  for (const candidate of candidates) {
    try {
      const page = await http.get<{ results?: Array<Record<string, unknown>> }>(
        `/content-manager/collection-types/${candidate.uid}`,
        { page: 1, pageSize: 1 },
      );
      const first = page.results?.[0];
      if (!first) continue;
      return typeof first['documentId'] === 'string' ? 'v5' : 'v4';
    } catch {
      continue;
    }
  }
  return 'unknown';
}

/**
 * Authenticate, detect, and hand back a ready dialect.
 *
 * The caller owns the returned dialect's lifetime — `dispose()` on the handle
 * releases the connection pool. Leaving it open holds sockets against someone
 * else's production CMS.
 */
export async function createDialect(conn: Connection): Promise<StrapiDialect> {
  const handle = await openDialect(conn);
  return handle.dialect;
}

export interface DialectHandle {
  dialect: StrapiDialect;
  http: StrapiHttpClient;
  version: StrapiVersion;
  dispose(): Promise<void>;
}

/**
 * `existing` reuses a session instead of signing in again.
 *
 * Strapi rate-limits POST /admin/login to a handful of attempts per window, so a
 * process that opens several dialects — a backup followed by a restore, or a
 * test suite — locks itself out by doing the obvious thing. Callers that already
 * hold a valid session should pass it.
 */
export async function openDialect(conn: Connection, existing?: Session): Promise<DialectHandle> {
  const session = existing ?? (await authenticate(conn));
  const http = new StrapiHttpClient(conn, session);
  try {
    const version = await detectWith(http);
    const dialect: StrapiDialect =
      version === 'v5' ? new StrapiV5Dialect(http, conn.url) : new StrapiV4Dialect(http, conn.url);
    return {
      dialect,
      http,
      version,
      dispose: () => http.dispose(),
    };
  } catch (error) {
    await http.dispose();
    throw error;
  }
}
