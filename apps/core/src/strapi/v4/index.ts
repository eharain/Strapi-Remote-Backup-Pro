/**
 * Strapi v4 dialect.
 *
 * Distinguishing traits this adapter absorbs:
 *  - records are identified by a numeric `id` only; there is no documentId, so
 *    cross-instance identity has to be synthesised and is inherently weaker
 *  - responses nest user fields under `attributes`
 *  - draft state is expressed as `publishedAt: null`, filtered via
 *    `publicationState`, not `status`
 *  - relations come back wrapped in `{ data: ... }` envelopes at every level
 */
export const DIALECT_VERSION = 'v4' as const;

export class StrapiV4Dialect {
  // implements StrapiDialect — see ../contracts.ts
}
