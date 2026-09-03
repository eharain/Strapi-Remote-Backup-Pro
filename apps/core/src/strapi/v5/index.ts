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
import type { ProbeResult } from '../../contracts/index.js';
import type {
  AttributeDef,
  ComponentDef,
  ContentTypeDef,
  MediaFile,
  NormalisedRecord,
  Page,
  PageRequest,
  StrapiDialect,
} from '../contracts.js';
import type { StrapiHttpClient } from '../client.js';
import { StrapiHttpError } from '../http.js';
import {
  ENVELOPE_KEYS,
  buildFormData,
  OMIT,
  normaliseMedia,
  relationRef,
  toEnvelope,
} from '../shared.js';

export const DIALECT_VERSION = 'v5' as const;

interface CtbContentType {
  uid: string;
  apiID: string;
  schema: {
    kind: 'collectionType' | 'singleType';
    displayName: string;
    draftAndPublish?: boolean;
    pluginOptions?: { i18n?: { localized?: boolean } };
    attributes: Record<string, AttributeDef>;
    visible?: boolean;
  };
}

interface CtbComponent {
  uid: string;
  category: string;
  apiId: string;
  schema: { displayName: string; attributes: Record<string, AttributeDef> };
}

interface Paginated<T> {
  results: T[];
  pagination?: { page: number; pageSize: number; pageCount: number; total: number };
}

export class StrapiV5Dialect implements StrapiDialect {
  readonly version = 'v5' as const;

  constructor(
    private readonly http: StrapiHttpClient,
    private readonly baseUrl: string,
  ) {}

  async probe(): Promise<ProbeResult> {
    const warnings: string[] = [];
    let canReadSchemas = false;
    try {
      await this.listContentTypes();
      canReadSchemas = true;
    } catch (error) {
      if (error instanceof StrapiHttpError && (error.status === 401 || error.status === 403)) {
        // An API token cannot reach the Content-Type Builder at all. The backup
        // still runs, but without schemas a restore cannot detect drift — say so
        // now rather than letting the user find out at restore time.
        warnings.push(
          'These credentials cannot read the Content-Type Builder, so schemas will not be captured. Restores from this archive cannot check for schema drift.',
        );
      } else {
        throw error;
      }
    }

    return {
      reachable: true,
      version: 'v5',
      authenticated: true,
      canReadSchemas,
      warnings,
    };
  }

  async listContentTypes(): Promise<ContentTypeDef[]> {
    const response = await this.http.get<{ data: CtbContentType[] }>('/content-type-builder/content-types');
    return response.data.map((entry) => ({
      uid: entry.uid,
      apiId: entry.apiID,
      kind: entry.schema.kind,
      displayName: entry.schema.displayName,
      draftAndPublish: entry.schema.draftAndPublish === true,
      i18nEnabled: entry.schema.pluginOptions?.i18n?.localized === true,
      attributes: entry.schema.attributes,
    }));
  }

  async listComponents(): Promise<ComponentDef[]> {
    const response = await this.http.get<{ data: CtbComponent[] }>('/content-type-builder/components');
    return response.data.map((entry) => ({
      uid: entry.uid,
      category: entry.category,
      displayName: entry.schema.displayName,
      attributes: entry.schema.attributes,
    }));
  }

  async listLocales(): Promise<string[]> {
    try {
      const locales = await this.http.get<Array<{ code: string }>>('/i18n/locales');
      return locales.map((locale) => locale.code);
    } catch (error) {
      // i18n is a plugin, not a guarantee. An instance without it has exactly one
      // implicit locale, and that is not a warning-worthy condition.
      if (error instanceof StrapiHttpError && error.status === 404) return [];
      throw error;
    }
  }

  async fetchPage(uid: string, req: PageRequest): Promise<Page<NormalisedRecord>> {
    const query: Record<string, unknown> = {
      page: req.page,
      pageSize: req.pageSize,
      // Ordering by updatedAt is load-bearing, not cosmetic: with offset paging,
      // a record edited during a long backup shifts between pages and is skipped
      // entirely — losing precisely the data someone was working on.
      sort: 'updatedAt:asc',
    };
    if (req.locale) query['locale'] = req.locale;
    if (req.status && req.status !== 'all') query['status'] = req.status;
    if (req.modifiedSince) {
      query['filters'] = { updatedAt: { $gte: req.modifiedSince } };
    }

    const response = await this.http.get<Paginated<Record<string, unknown>>>(
      `/content-manager/collection-types/${uid}`,
      query,
    );

    const items = (response.results ?? []).map((row) => this.normalise(row));
    const pagination = response.pagination;
    const page = pagination?.page ?? req.page;
    const pageSize = pagination?.pageSize ?? req.pageSize;
    const total = pagination?.total ?? items.length;
    return {
      items,
      page,
      pageSize,
      total,
      hasMore: pagination ? page < pagination.pageCount : items.length === pageSize,
    };
  }

  async fetchSingle(uid: string, locale?: string): Promise<NormalisedRecord | null> {
    try {
      const row = await this.http.get<Record<string, unknown>>(
        `/content-manager/single-types/${uid}`,
        locale ? { locale } : undefined,
      );
      // An empty single type answers 404 on some versions and `{ data: null }` on
      // others. Both mean the same thing: nothing to back up.
      if (!row || row['documentId'] === undefined) return null;
      return this.normalise(row);
    } catch (error) {
      if (error instanceof StrapiHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async fetchByIds(uid: string, documentIds: string[]): Promise<NormalisedRecord[]> {
    if (documentIds.length === 0) return [];
    const out: NormalisedRecord[] = [];
    // Chunked because the filter goes in the query string, and a few hundred
    // document ids will exceed what proxies in front of Strapi accept.
    const chunkSize = 50;
    for (let index = 0; index < documentIds.length; index += chunkSize) {
      const chunk = documentIds.slice(index, index + chunkSize);
      const response = await this.http.get<Paginated<Record<string, unknown>>>(
        `/content-manager/collection-types/${uid}`,
        {
          page: 1,
          pageSize: chunk.length,
          filters: { documentId: { $in: chunk } },
        },
      );
      for (const row of response.results ?? []) out.push(this.normalise(row));
    }
    return out;
  }

  async listMedia(req: PageRequest): Promise<Page<MediaFile>> {
    const response = await this.http.get<Paginated<Record<string, unknown>>>('/upload/files', {
      page: req.page,
      pageSize: req.pageSize,
      sort: 'createdAt:asc',
    });
    const items = (response.results ?? []).map((row) => normaliseMedia(row));
    const pagination = response.pagination;
    const page = pagination?.page ?? req.page;
    const pageSize = pagination?.pageSize ?? req.pageSize;
    return {
      items,
      page,
      pageSize,
      total: pagination?.total ?? items.length,
      hasMore: pagination ? page < pagination.pageCount : items.length === pageSize,
    };
  }

  async downloadMedia(file: MediaFile): Promise<ReadableStream<Uint8Array>> {
    // A local provider gives a site-relative path; S3 and friends give an
    // absolute URL to a host that is not Strapi at all.
    if (/^https?:\/\//i.test(file.url)) {
      const response = await fetch(file.url);
      if (!response.ok || !response.body) {
        throw new Error(`Could not download ${file.name}: ${response.status} ${response.statusText}`);
      }
      return response.body;
    }
    return this.http.stream(file.url);
  }

  async createRecord(uid: string, record: NormalisedRecord): Promise<NormalisedRecord> {
    const body = this.serialise(record);
    const created = await this.http.post<Record<string, unknown>>(
      `/content-manager/collection-types/${uid}`,
      body,
    );
    return this.normalise(unwrap(created));
  }

  async updateRecord(uid: string, documentId: string, record: NormalisedRecord): Promise<NormalisedRecord> {
    const body = this.serialise(record);
    const updated = await this.http.put<Record<string, unknown>>(
      `/content-manager/collection-types/${uid}/${documentId}`,
      body,
    );
    return this.normalise(unwrap(updated));
  }

  async deleteRecord(uid: string, documentId: string): Promise<void> {
    await this.http.delete(`/content-manager/collection-types/${uid}/${documentId}`);
  }

  async publishRecord(uid: string, documentId: string): Promise<void> {
    await this.http.post(`/content-manager/collection-types/${uid}/${documentId}/actions/publish`, {});
  }

  async uploadMedia(file: MediaFile, body: ReadableStream<Uint8Array>): Promise<MediaFile> {
    const form = await buildFormData(file, body);
    const uploaded = await this.http.postForm<Record<string, unknown>[]>('/upload', form);
    const first = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (!first) throw new Error(`Upload of ${file.name} returned no file record.`);
    return normaliseMedia(first);
  }

  /**
   * Flatten one v5 row into the internal record shape.
   *
   * Relations arrive fully populated from the content manager. Keeping those
   * nested copies would mean an article's archive entry contains a whole author,
   * so every relation collapses to an identity reference — which is also the only
   * form a restore can remap onto a different instance.
   */
  private normalise(row: Record<string, unknown>): NormalisedRecord {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (ENVELOPE_KEYS.has(key)) continue;
      const mapped = relationRef(value);
      // Derived state the content manager computes onto the row. Archiving it
      // would store a number where a relation belongs.
      if (mapped === OMIT) continue;
      fields[key] = mapped;
    }
    return toEnvelope(row, fields);
  }

  /** The inverse: an internal record as a content-manager write body. */
  private serialise(record: NormalisedRecord): Record<string, unknown> {
    const body: Record<string, unknown> = { ...record.fields };
    if (record.locale) body['locale'] = record.locale;
    return body;
  }
}

/** Write endpoints answer `{ data: {...} }`; read endpoints answer the row. */
function unwrap(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload['data'];
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return payload;
}
