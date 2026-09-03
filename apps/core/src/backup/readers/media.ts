/**
 * Enumerate and download the media library, preserving folder structure.
 *
 * Files are streamed to the archive without buffering. Downloads go through the
 * same concurrency limiter as everything else — a media library is where it is
 * easiest to accidentally saturate someone's origin server.
 */
import type { MediaFile, StrapiDialect } from '../../strapi/contracts.js';

export const MEDIA_PAGE_SIZE = 100;

/**
 * Every file in the library, page by page.
 *
 * Yields rather than collecting: a library of 34,000 files is ordinary, and
 * holding the full listing before the first download starts delays the part of
 * the run that actually takes the time.
 */
export async function* listAllMedia(
  dialect: StrapiDialect,
  signal?: AbortSignal,
): AsyncIterable<MediaFile> {
  let page = 1;
  for (;;) {
    if (signal?.aborted) return;
    const result = await dialect.listMedia({ page, pageSize: MEDIA_PAGE_SIZE });
    for (const file of result.items) yield file;
    if (!result.hasMore || result.items.length === 0) return;
    page += 1;
  }
}

/**
 * Where one file's bytes live inside the archive.
 *
 * Laid out by content hash rather than by original filename: two library entries
 * can share a name in different folders, and a hash is also what a restore has
 * to match on, since the destination instance reassigns every numeric id.
 */
export function mediaEntryPath(dir: string, file: MediaFile): string {
  const extension = file.ext.startsWith('.') ? file.ext : file.ext ? `.${file.ext}` : '';
  return `${dir}/${file.hash}${extension}`;
}
