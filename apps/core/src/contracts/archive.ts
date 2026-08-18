import { z } from 'zod';
import { StrapiVersionSchema } from './connection.js';
import { SelectionSchema } from './selection.js';

/**
 * Bumped whenever the on-disk layout changes in a way older readers cannot
 * handle. The reader refuses archives from a future major and warns on a future
 * minor. See docs/architecture/archive-format.md.
 */
export const ARCHIVE_FORMAT_VERSION = '1.0';

/** manifest.json — the first thing read, and the only thing needed to decide
 *  whether an archive can be opened at all. */
export const ManifestSchema = z.object({
  formatVersion: z.string(),
  producedBy: z.object({
    tool: z.literal('strapi-remote-backup-pro'),
    version: z.string(),
  }),
  createdAt: z.string().datetime(),
  label: z.string().optional(),

  source: z.object({
    url: z.string(),
    version: StrapiVersionSchema,
    versionString: z.string().optional(),
  }),

  selection: SelectionSchema,

  /** Encryption applies to entry payloads, never to the manifest — the manifest
   *  must stay readable so a UI can list an archive without the passphrase. */
  encryption: z
    .object({
      algorithm: z.literal('aes-256-gcm'),
      kdf: z.literal('scrypt'),
      salt: z.string(),
    })
    .optional(),

  contents: z.object({
    contentTypes: z.array(
      z.object({
        uid: z.string(),
        recordCount: z.number(),
        file: z.string(),
        sha256: z.string(),
      }),
    ),
    mediaFiles: z.number(),
    mediaBytes: z.number(),
    componentCount: z.number(),
    locales: z.array(z.string()),
  }),
});
export type Manifest = z.infer<typeof ManifestSchema>;
