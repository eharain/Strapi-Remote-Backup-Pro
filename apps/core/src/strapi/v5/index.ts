/**
 * Strapi v5 dialect.
 *
 * Distinguishing traits this adapter absorbs:
 *  - records are identified by `documentId`; the numeric `id` is instance-local
 *    and must never be carried across instances
 *  - responses are flat — no `attributes` nesting
 *  - draft/published are two versions of one document, selected with `status`
 *  - locales are separate documents sharing a documentId
 */
export const DIALECT_VERSION = 'v5' as const;

export class StrapiV5Dialect {
  // implements StrapiDialect — see ../contracts.ts
}
