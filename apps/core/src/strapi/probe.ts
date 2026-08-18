import type { Connection, StrapiVersion } from '../contracts/index.js';
import type { StrapiDialect } from './contracts.js';

/**
 * Work out which dialect an instance speaks, before anything else happens.
 *
 * Strapi does not advertise its major version on an unauthenticated endpoint in
 * any dependable way, so this probes behaviour rather than trusting a version
 * string: the shape of a Content-Type Builder response distinguishes v4 from v5
 * reliably, where a version banner may be absent, proxied away, or wrong.
 */
export async function detectVersion(_conn: Connection): Promise<StrapiVersion> {
  throw new Error('not implemented');
}

export async function createDialect(_conn: Connection): Promise<StrapiDialect> {
  throw new Error('not implemented');
}
