/**
 * Page through a content type's records.
 *
 * Sorted by `updatedAt` ascending and paged by offset. That ordering matters:
 * records edited during a long backup would otherwise shift between pages and be
 * silently skipped, which is the classic way a backup tool loses exactly the
 * data that was being worked on.
 */
import type { ContentTypeDef, NormalisedRecord, PageRequest, StrapiDialect } from '../../strapi/contracts.js';

export interface EntryReadOptions {
  /** Locales to fetch. Empty means the instance has no i18n, so one pass. */
  locales: string[];
  includeDrafts: boolean;
  modifiedSince?: string;
  /** When present, only these documents are read rather than the whole type. */
  documentIds?: Set<string>;
  pageSize: number;
  signal?: AbortSignal;
}

export const DEFAULT_PAGE_SIZE = 100;

/**
 * Yield every record of one content type, once per locale and once per
 * publication state.
 *
 * Draft and published are separate versions of the same document on v5, and a
 * backup that captured only one of them silently discards half the editorial
 * state — an unpublished revision, or the live copy that differs from it. Both
 * are emitted, and `publishedAt` tells them apart on the way back in.
 */
export async function* readRecords(
  dialect: StrapiDialect,
  type: ContentTypeDef,
  options: EntryReadOptions,
): AsyncIterable<NormalisedRecord> {
  const locales = type.i18nEnabled && options.locales.length > 0 ? options.locales : [undefined];
  const states = statesFor(type, options.includeDrafts);

  for (const locale of locales) {
    for (const status of states) {
      if (type.kind === 'singleType') {
        const record = await dialect.fetchSingle(type.uid, locale);
        if (record) yield record;
        continue;
      }

      if (options.documentIds && options.documentIds.size > 0) {
        const records = await dialect.fetchByIds(type.uid, [...options.documentIds]);
        for (const record of records) yield record;
        // fetchByIds ignores publication state, so a second pass would only
        // repeat what the first already produced.
        break;
      }

      yield* readPages(dialect, type.uid, options, locale, status);
    }
  }
}

async function* readPages(
  dialect: StrapiDialect,
  uid: string,
  options: EntryReadOptions,
  locale: string | undefined,
  status: PageRequest['status'],
): AsyncIterable<NormalisedRecord> {
  let page = 1;
  for (;;) {
    if (options.signal?.aborted) return;

    const request: PageRequest = { page, pageSize: options.pageSize };
    if (locale !== undefined) request.locale = locale;
    if (status !== undefined) request.status = status;
    if (options.modifiedSince !== undefined) request.modifiedSince = options.modifiedSince;

    const result = await dialect.fetchPage(uid, request);
    for (const record of result.items) yield record;

    if (!result.hasMore || result.items.length === 0) return;
    page += 1;
  }
}

/**
 * Which publication states to sweep.
 *
 * A type without Draft & Publish has exactly one version per document, and
 * asking such a type for `status=draft` is not merely redundant — some Strapi
 * builds reject the parameter outright.
 */
function statesFor(type: ContentTypeDef, includeDrafts: boolean): Array<PageRequest['status']> {
  if (!type.draftAndPublish) return [undefined];
  return includeDrafts ? ['published', 'draft'] : ['published'];
}
