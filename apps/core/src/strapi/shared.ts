/**
 * Normalisation shared by both dialects.
 *
 * v4 and v5 disagree about record shape, but once the envelope has been peeled
 * off, the questions "is this a relation?", "is this a media file?" and "is this
 * a component?" have the same answers on both. Keeping those answers in one
 * place is what stops the two adapters drifting into two different archive
 * formats.
 */
import { FormData } from 'undici';
import type { MediaFile, NormalisedRecord } from './contracts.js';

/**
 * Keys that belong to the record envelope rather than to the user's data.
 *
 * `localizations` is dropped deliberately: on v5 every locale of a document
 * shares its documentId, so the sibling list is derivable and storing it would
 * bake instance-local numeric ids into the archive.
 */
export const ENVELOPE_KEYS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
  'createdBy',
  'updatedBy',
  'localizations',
  // v5's content manager computes a `status` of draft/published/modified onto
  // every row. It is derived state, not user data: sending it back on restore
  // would write a field the content type does not have.
  'status',
]);

/**
 * How a reference is written into the archive.
 *
 * Relations arrive from the content manager fully populated. Storing them that
 * way would put a complete copy of an author inside every one of their articles,
 * and — worse — would carry instance-local numeric ids across to a restore that
 * cannot honour them. Both kinds collapse to an identity marker, and
 * restore/remap.ts is the only place that turns them back into something a live
 * instance will accept.
 */
export const REF_MARKER = '__ref' as const;

export interface RelationRef {
  __ref: 'relation';
  documentId: string;
}

export interface MediaRef {
  __ref: 'media';
  /**
   * Strapi's hash for the file — `<name>_<random>`.
   *
   * This addresses the binary *inside the archive*, and nothing else. It is not
   * portable: the upload plugin generates a fresh random suffix every time a
   * file is uploaded, so the same image has a different hash in every instance
   * it has ever been added to, and the byte size is not portable either because
   * the upload plugin re-encodes images. Matching an archived file to one that
   * already exists in a destination is done on folder plus filename — see
   * restore/applier.ts.
   */
  hash: string;
  name: string;
  ext: string;
  mime: string;
}

export function isRelationRef(value: unknown): value is RelationRef {
  return isObject(value) && value[REF_MARKER] === 'relation' && typeof value['documentId'] === 'string';
}

export function isMediaRef(value: unknown): value is MediaRef {
  return isObject(value) && value[REF_MARKER] === 'media' && typeof value['hash'] === 'string';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A populated media object, as the upload plugin returns it. */
function looksLikeMedia(value: Record<string, unknown>): boolean {
  return typeof value['hash'] === 'string' && typeof value['mime'] === 'string' && typeof value['url'] === 'string';
}

export type IdentifyRelation = (value: Record<string, unknown>) => string | undefined;

/**
 * v5 identifies a related record by `documentId`. v4 has no such field and can
 * only offer the instance-local numeric id, which is exactly why a v4 archive
 * cannot be restored into a different instance without an explicit mapping —
 * see the note on NormalisedRecord.documentId.
 */
export const identifyByDocumentId: IdentifyRelation = (value) =>
  typeof value['documentId'] === 'string' ? value['documentId'] : undefined;

export const identifyByNumericId: IdentifyRelation = (value) =>
  typeof value['id'] === 'number' ? String(value['id']) : undefined;

/**
 * Reduce one populated field to what the archive should hold.
 *
 * Recurses through components and dynamic zones, because a relation nested three
 * levels down inside a dynamic zone is exactly as instance-local as one at the
 * top, and missing it produces an archive that restores with silently broken
 * links.
 */
/**
 * Marker for a field that must not be archived at all.
 *
 * Distinct from `null`, which is a value the user chose. Callers drop the key.
 */
export const OMIT = Symbol('omit-derived-field');

/**
 * An un-populated to-many relation, which the content manager reports as a bare
 * count instead of the records.
 *
 * Derived state, and not restorable: the inverse side of a relation is set by
 * whichever side owns it, so `author.articles` is reconstructed by Strapi the
 * moment each article's `author` is written. Archiving the count would put a
 * number where a list belongs, and writing it back means sending `{count: 2}`
 * to a relation field.
 */
function isRelationCount(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'count' && typeof value['count'] === 'number';
}

export function relationRef(value: unknown, identify: IdentifyRelation = identifyByDocumentId): unknown {
  if (Array.isArray(value)) return value.map((item) => relationRef(item, identify));
  if (!isObject(value)) return value;

  if (isRelationCount(value)) return OMIT;

  if (looksLikeMedia(value)) {
    return {
      [REF_MARKER]: 'media',
      hash: String(value['hash']),
      name: String(value['name'] ?? ''),
      ext: String(value['ext'] ?? ''),
      mime: String(value['mime'] ?? ''),
    } satisfies MediaRef;
  }

  // A component carries an id too, so identity alone is not enough to tell a
  // relation from a component: only something with no `__component` marker and
  // no further user fields beyond the envelope is a bare reference.
  const identity = identify(value);
  if (identity !== undefined && looksLikeReference(value)) {
    return { [REF_MARKER]: 'relation', documentId: identity } satisfies RelationRef;
  }

  // A component or dynamic-zone entry. Its own `id` is instance-local and is
  // dropped; `__component` identifies which component this is and must survive.
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id') continue;
    out[key] = relationRef(child, identify);
  }
  return out;
}

/**
 * Distinguish a populated relation from a component.
 *
 * Both arrive as nested objects with an `id`. A component declares itself with
 * `__component` inside a dynamic zone, but a plain repeatable component does
 * not — what separates them is that a relation is a row of another content type
 * and therefore carries the record timestamps, while a component never does.
 */
function looksLikeReference(value: Record<string, unknown>): boolean {
  if (typeof value['__component'] === 'string') return false;
  return 'createdAt' in value || 'updatedAt' in value || 'publishedAt' in value;
}

/** Build the record envelope, honouring exactOptionalPropertyTypes. */
export function toEnvelope(row: Record<string, unknown>, fields: Record<string, unknown>): NormalisedRecord {
  const record: NormalisedRecord = {
    documentId: String(row['documentId'] ?? row['id'] ?? ''),
    fields,
  };
  if (typeof row['id'] === 'number') record.id = row['id'];
  if (typeof row['locale'] === 'string') record.locale = row['locale'];
  if (typeof row['createdAt'] === 'string') record.createdAt = row['createdAt'];
  if (typeof row['updatedAt'] === 'string') record.updatedAt = row['updatedAt'];
  if (row['publishedAt'] === null || typeof row['publishedAt'] === 'string') {
    record.publishedAt = row['publishedAt'] as string | null;
  }
  return record;
}

/** Normalise one row from /upload/files. */
export function normaliseMedia(row: Record<string, unknown>): MediaFile {
  const file: MediaFile = {
    id: Number(row['id'] ?? 0),
    name: String(row['name'] ?? ''),
    hash: String(row['hash'] ?? ''),
    ext: String(row['ext'] ?? ''),
    mime: String(row['mime'] ?? 'application/octet-stream'),
    // Strapi reports `size` as kilobytes computed as bytes/1000, not bytes/1024 —
    // measured against a real file: 271542 bytes is reported as 271.54. This is
    // an estimate for planning only; the run report uses the bytes actually
    // streamed, because a byte count that is really kilobytes is the kind of
    // unit bug that only ever surfaces as a wrong total nobody checks.
    size: Math.round(Number(row['size'] ?? 0) * 1000),
    url: String(row['url'] ?? ''),
  };
  if (typeof row['documentId'] === 'string') file.documentId = row['documentId'];
  // Strapi writes the root folder as both '' and '/' depending on how the file
  // was created. Left as-is, the same file in the same place compares unequal
  // and a restore uploads a second copy of it.
  if (typeof row['folderPath'] === 'string' && row['folderPath'] !== '') file.folderPath = row['folderPath'];
  if (typeof row['alternativeText'] === 'string') file.alternativeText = row['alternativeText'];
  if (typeof row['caption'] === 'string') file.caption = row['caption'];
  return file;
}

/**
 * Assemble the multipart body Strapi's /upload endpoint expects.
 *
 * The stream is collected into memory first, because multipart needs a known
 * length and Strapi's upload route will not accept a chunked body. That caps
 * upload memory at one file rather than one library — acceptable, since media
 * items are individually small even when a library is not, but it is the one
 * place in the engine that is not constant-memory and it is deliberate.
 */
export async function buildFormData(file: MediaFile, body: ReadableStream<Uint8Array>): Promise<FormData> {
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const form = new FormData();
  form.append('files', new Blob([Buffer.concat(chunks)], { type: file.mime }), file.name);

  const info: Record<string, unknown> = { name: file.name };
  if (file.alternativeText !== undefined) info['alternativeText'] = file.alternativeText;
  if (file.caption !== undefined) info['caption'] = file.caption;
  form.append('fileInfo', JSON.stringify(info));
  if (file.folderPath && file.folderPath !== '/') {
    form.append('path', file.folderPath);
  }
  return form;
}
