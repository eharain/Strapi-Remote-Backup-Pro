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
  identifyByNumericId,
  OMIT,
  normaliseMedia,
  relationRef,
  toEnvelope,
} from '../shared.js';

export const DIALECT_VERSION = 'v4' as const;

interface CtbContentType {
  uid: string;
  apiID: string;
  schema: {
    kind: 'collectionType' | 'singleType';
    displayName: string;
    draftAndPublish?: boolean;
    pluginOptions?: { i18n?: { localized?: boolean } };
    attributes: Record<string, AttributeDef>;
  };
}

interface CtbComponent {
  uid: string;
  category: string;
  apiId: string;
  schema: { displayName: string; attributes: Record<string, AttributeDef> };
}

interface Paginated<T> {
  results?: T[];
  pagination?: { page: number; pageSize: number; pageCount: number; total: number };
}

export class StrapiV4Dialect implements StrapiDialect {
  readonly version = 'v4' as const;

  constructor(
    private readonly http: StrapiHttpClient,
    private readonly baseUrl: string,
  ) {}

  async probe(): Promise<ProbeResult> {
    const warnings: string[] = [
      // Said once, up front. v4 records have no stable cross-instance identity,
      // and a user who discovers that at restore time has already committed to
      // this archive as their backup.
      'This is a Strapi v4 instance. v4 records have no documentId, so identity is synthesised from the numeric id — restoring this archive into a different instance will create new records rather than matching existing ones.',
    ];
    let canReadSchemas = false;
    try {
      await this.listContentTypes();
      canReadSchemas = true;
    } catch (error) {
      if (error instanceof StrapiHttpError && (error.status === 401 || error.status === 403)) {
        warnings.push(
          'These credentials cannot read the Content-Type Builder, so schemas will not be captured. Restores from this archive cannot check for schema drift.',
        );
      } else {
        throw error;
      }
    }

    return { reachable: true, version: 'v4', authenticated: true, canReadSchemas, warnings };
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
      if (error instanceof StrapiHttpError && error.status === 404) return [];
      throw error;
    }
  }

  async fetchPage(uid: string, req: PageRequest): Promise<Page<NormalisedRecord>> {
    const query: Record<string, unknown> = {
      page: req.page,
      pageSize: req.pageSize,
      sort: 'updatedAt:asc',
    };
    if (req.locale) query['locale'] = req.locale;
    // v4 has no `status`. Draft and published are one row distinguished by
    // publishedAt, so the filter goes on the column itself.
    if (req.status === 'published') query['filters'] = { publishedAt: { $notNull: true } };
    if (req.status === 'draft') query['filters'] = { publishedAt: { $null: true } };
    if (req.modifiedSince) {
      const existing = (query['filters'] as Record<string, unknown> | undefined) ?? {};
      query['filters'] = { ...existing, updatedAt: { $gte: req.modifiedSince } };
    }

    const response = await this.http.get<Paginated<Record<string, unknown>>>(
      `/content-manager/collection-types/${uid}`,
      query,
    );

    const items = (response.results ?? []).map((row) => this.normalise(row));
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

  async fetchSingle(uid: string, locale?: string): Promise<NormalisedRecord | null> {
    try {
      const row = await this.http.get<Record<string, unknown>>(
        `/content-manager/single-types/${uid}`,
        locale ? { locale } : undefined,
      );
      if (!row || row['id'] === undefined) return null;
      return this.normalise(row);
    } catch (error) {
      if (error instanceof StrapiHttpError && error.status === 404) return null;
      throw error;
    }
  }

  async fetchByIds(uid: string, documentIds: string[]): Promise<NormalisedRecord[]> {
    if (documentIds.length === 0) return [];
    const numeric = documentIds.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    if (numeric.length === 0) return [];

    const out: NormalisedRecord[] = [];
    const chunkSize = 50;
    for (let index = 0; index < numeric.length; index += chunkSize) {
      const chunk = numeric.slice(index, index + chunkSize);
      const response = await this.http.get<Paginated<Record<string, unknown>>>(
        `/content-manager/collection-types/${uid}`,
        { page: 1, pageSize: chunk.length, filters: { id: { $in: chunk } } },
      );
      for (const row of response.results ?? []) out.push(this.normalise(row));
    }
    return out;
  }

  async listMedia(req: PageRequest): Promise<Page<MediaFile>> {
    // Early 4.x answers /upload/files with a bare array; later 4.x paginates.
    // Both shapes are in the wild, so both are handled rather than assumed.
    const response = await this.http.get<Paginated<Record<string, unknown>> | Record<string, unknown>[]>(
      '/upload/files',
      { page: req.page, pageSize: req.pageSize, sort: 'createdAt:asc' },
    );

    if (Array.isArray(response)) {
      const items = response.map((row) => normaliseMedia(row));
      return { items, page: 1, pageSize: items.length, total: items.length, hasMore: false };
    }

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
    const created = await this.http.post<Record<string, unknown>>(
      `/content-manager/collection-types/${uid}`,
      this.serialise(record),
    );
    return this.normalise(unwrap(created));
  }

  async updateRecord(uid: string, documentId: string, record: NormalisedRecord): Promise<NormalisedRecord> {
    const updated = await this.http.put<Record<string, unknown>>(
      `/content-manager/collection-types/${uid}/${documentId}`,
      this.serialise(record),
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

  private normalise(row: Record<string, unknown>): NormalisedRecord {
    const flat = unwrapEnvelopes(row) as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flat)) {
      if (ENVELOPE_KEYS.has(key)) continue;
      const mapped = relationRef(value, identifyByNumericId);
      if (mapped === OMIT) continue;
      fields[key] = mapped;
    }
    const record = toEnvelope(flat, fields);
    // v4 has no documentId. Synthesising one from the numeric id keeps the rest
    // of the engine version-agnostic, at the cost recorded in probe()'s warning.
    if (!record.documentId && typeof flat['id'] === 'number') {
      record.documentId = String(flat['id']);
    }
    return record;
  }

  private serialise(record: NormalisedRecord): Record<string, unknown> {
    const body: Record<string, unknown> = { ...record.fields };
    if (record.locale) body['locale'] = record.locale;
    return body;
  }
}

/**
 * Strip v4's `{ data: ..., meta: ... }` envelopes, and the `attributes` nesting,
 * wherever they appear.
 *
 * v4 wraps at every level — a relation inside a component inside a dynamic zone
 * arrives triple-wrapped — so this is recursive rather than a top-level unwrap.
 */
function unwrapEnvelopes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapEnvelopes);
  if (typeof value !== 'object' || value === null) return value;

  const record = value as Record<string, unknown>;

  if ('data' in record && Object.keys(record).every((key) => key === 'data' || key === 'meta')) {
    return unwrapEnvelopes(record['data']);
  }

  if ('attributes' in record && typeof record['attributes'] === 'object' && record['attributes'] !== null) {
    const attributes = unwrapEnvelopes(record['attributes']) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...attributes };
    if ('id' in record) merged['id'] = record['id'];
    return merged;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) out[key] = unwrapEnvelopes(child);
  return out;
}

function unwrap(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload['data'];
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return payload;
}
