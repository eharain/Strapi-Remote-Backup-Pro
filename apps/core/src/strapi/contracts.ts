import type { ProbeResult, StrapiVersion } from '../contracts/index.js';

/**
 * A record as this tool handles it internally, normalised away from whichever
 * dialect produced it.
 *
 * Strapi v4 and v5 disagree about almost everything structural: v4 nests fields
 * under `attributes` and identifies records by numeric `id`; v5 flattens the
 * payload and identifies them by `documentId`. Both of those differences stop at
 * this boundary — nothing above the dialect layer knows which version is on the
 * other end of the wire.
 */
export interface NormalisedRecord {
  /** Stable cross-instance identity. On v4 this is synthesised from the numeric
   *  id, which is why v4 archives cannot be restored into a different instance
   *  without an explicit identity mapping. */
  documentId: string;
  /** The instance-local numeric id, when the dialect exposes one. */
  id?: number;
  locale?: string;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Everything else — user-defined fields, components, dynamic zones. */
  fields: Record<string, unknown>;
}

export interface AttributeDef {
  type: string;
  /** Present on relation attributes: the UID of the far side. */
  target?: string;
  relation?: string;
  /** Present on component attributes. */
  component?: string;
  components?: string[];
  repeatable?: boolean;
  required?: boolean;
}

export interface ContentTypeDef {
  uid: string;
  apiId: string;
  kind: 'collectionType' | 'singleType';
  displayName: string;
  draftAndPublish: boolean;
  i18nEnabled: boolean;
  attributes: Record<string, AttributeDef>;
}

export interface ComponentDef {
  uid: string;
  category: string;
  displayName: string;
  attributes: Record<string, AttributeDef>;
}

export interface MediaFile {
  id: number;
  documentId?: string;
  name: string;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  folderPath?: string;
  alternativeText?: string;
  caption?: string;
}

export interface PageRequest {
  page: number;
  pageSize: number;
  locale?: string;
  /** Ask for drafts, published records, or both, on types that have Draft &
   *  Publish enabled. The dialects express this very differently. */
  status?: 'draft' | 'published' | 'all';
  modifiedSince?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * Everything the rest of the engine is allowed to ask of a Strapi instance.
 *
 * Implemented once per major version under ./v4 and ./v5. Adding support for a
 * future Strapi major should mean adding a folder here and nothing else.
 */
export interface StrapiDialect {
  readonly version: StrapiVersion;

  probe(): Promise<ProbeResult>;

  /** Content types and components, read from the Content-Type Builder. This is
   *  the replacement for the in-process `strapi.contentTypes` that a plugin
   *  would have had — and the reason admin credentials matter. */
  listContentTypes(): Promise<ContentTypeDef[]>;
  listComponents(): Promise<ComponentDef[]>;
  listLocales(): Promise<string[]>;

  /** One page of records. Paging is the caller's job so that a backup of a
   *  200k-row collection never has to hold more than a page in memory. */
  fetchPage(uid: string, req: PageRequest): Promise<Page<NormalisedRecord>>;
  fetchSingle(uid: string, locale?: string): Promise<NormalisedRecord | null>;
  /** Fetch specific documents — how relation-depth expansion pulls in records
   *  that were not part of the original selection. */
  fetchByIds(uid: string, documentIds: string[]): Promise<NormalisedRecord[]>;

  listMedia(req: PageRequest): Promise<Page<MediaFile>>;
  downloadMedia(file: MediaFile): Promise<ReadableStream<Uint8Array>>;

  /** Write paths, used only by restore. */
  createRecord(uid: string, record: NormalisedRecord): Promise<NormalisedRecord>;
  updateRecord(uid: string, documentId: string, record: NormalisedRecord): Promise<NormalisedRecord>;
  deleteRecord(uid: string, documentId: string): Promise<void>;
  publishRecord(uid: string, documentId: string): Promise<void>;
  uploadMedia(file: MediaFile, body: ReadableStream<Uint8Array>): Promise<MediaFile>;
}
