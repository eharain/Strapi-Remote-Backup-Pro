/**
 * The on-disk archive layout.
 *
 *   backup-2026-08-18T1430.zip
 *   ├── manifest.json          format version, source, selection, counts, checksums
 *   ├── schemas/
 *   │   ├── content-types.json
 *   │   └── components.json
 *   ├── content/
 *   │   └── api--article.article.ndjson    one record per line
 *   ├── media/
 *   │   ├── media.ndjson                   file metadata + folder paths
 *   │   └── files/<hash><ext>              binaries, laid out by hash
 *   └── meta/
 *       ├── locales.json
 *       └── run-report.json
 *
 * NDJSON rather than JSON for content is the load-bearing decision: a 200k-entry
 * collection as a single JSON array cannot be written or read without holding all
 * of it in memory, which defeats the point of a backup tool that has to work on
 * the largest instances rather than the smallest.
 *
 * Full specification: docs/architecture/archive-format.md
 */
export const ARCHIVE_PATHS = {
  manifest: 'manifest.json',
  contentTypes: 'schemas/content-types.json',
  components: 'schemas/components.json',
  locales: 'meta/locales.json',
  runReport: 'meta/run-report.json',
  mediaIndex: 'media/media.ndjson',
  mediaDir: 'media/files',
  contentDir: 'content',
} as const;

/** Content-type UIDs contain characters that are awkward inside zip entries, so
 *  `api::article.article` is stored as `api--article.article.ndjson`. */
export function contentEntryPath(uid: string): string {
  return `${ARCHIVE_PATHS.contentDir}/${uid.replace(/::/g, '--')}.ndjson`;
}

export function uidFromEntryPath(path: string): string {
  return path
    .replace(`${ARCHIVE_PATHS.contentDir}/`, '')
    .replace(/\.ndjson$/, '')
    .replace(/--/g, '::');
}
