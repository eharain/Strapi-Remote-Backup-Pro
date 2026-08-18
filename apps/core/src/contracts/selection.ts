import { z } from 'zod';

/**
 * What to include in a backup, or what to pull out of one on restore.
 *
 * `depth` is the interesting part: when a content type is selected, related
 * records from types that were NOT selected can still be pulled in so the
 * restored data is not full of dangling references. Depth 0 means "only what I
 * picked"; depth 1 follows relations one hop; and so on.
 */
export const SelectionSchema = z.object({
  /** Content-type UIDs, e.g. "api::article.article". Empty means everything. */
  contentTypes: z.array(z.string()).default([]),
  /** Restrict to specific documents within the selected types. */
  documentIds: z.record(z.string(), z.array(z.string())).default({}),
  /** How many relation hops to follow beyond the explicit selection. */
  depth: z.number().int().min(0).max(10).default(1),
  /** Follow relations into types the user did not select. Off means depth only
   *  expands within the selected set. */
  followUnselectedTypes: z.boolean().default(true),
  includeMedia: z.boolean().default(true),
  includeSchemas: z.boolean().default(true),
  includeDrafts: z.boolean().default(true),
  /** Locale codes to include. Empty means all locales. */
  locales: z.array(z.string()).default([]),
  /** Only records modified since this instant — the basis of incremental runs. */
  modifiedSince: z.string().datetime().optional(),
});
export type Selection = z.infer<typeof SelectionSchema>;

/** How an incoming record is reconciled with what already exists on restore. */
export const ConflictStrategySchema = z.enum([
  'create',   // always insert; never touch existing records
  'upsert',   // update when the document exists, insert when it does not
  'skip',     // insert only what is missing; leave existing records alone
  'replace',  // delete the existing document, then insert
]);
export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>;

export const RestoreOptionsSchema = z.object({
  selection: SelectionSchema,
  strategy: ConflictStrategySchema.default('upsert'),
  /** Plan and report the changes without writing anything. */
  dryRun: z.boolean().default(false),
  /** Restore media binaries as well as the records that reference them. */
  restoreMedia: z.boolean().default(true),
  /** Publish restored entries that were published in the archive. When false
   *  everything lands as a draft, which is the safer default for production. */
  preservePublishState: z.boolean().default(true),
  /** Abort the whole run on the first failure rather than collecting errors. */
  stopOnError: z.boolean().default(false),
});
export type RestoreOptions = z.infer<typeof RestoreOptionsSchema>;
