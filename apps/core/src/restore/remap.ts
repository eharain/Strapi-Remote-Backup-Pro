/**
 * Rewrite identities as records move between instances.
 *
 * Nothing in an archive can assume the destination will hand out the same ids.
 * Numeric ids are always instance-local; on v5 `documentId` is stable enough to
 * match on, but media ids, component ids, and any relation pointing at a record
 * created during this same restore all have to be rewritten as the run proceeds.
 *
 * The map is built incrementally: every write records old-id → new-id, and later
 * writes consult it before serialising their relations.
 */
import { isMediaRef, isRelationRef } from '../strapi/shared.js';

export interface IdMap {
  record(uid: string, oldId: string, newId: string): void;
  resolve(uid: string, oldId: string): string | undefined;
  resolveMedia(oldId: number): number | undefined;
  /** Media is matched by content hash, the only identity that survives a
   *  re-upload — both the numeric id and the documentId are reassigned. */
  recordMedia(hash: string, newId: number, oldId?: number): void;
  resolveMediaHash(hash: string): number | undefined;
}

export function createIdMap(): IdMap {
  const records = new Map<string, string>();
  const mediaByHash = new Map<string, number>();
  const mediaByOldId = new Map<number, number>();

  const key = (uid: string, oldId: string): string => `${uid}\u0000${oldId}`;

  return {
    record(uid, oldId, newId) {
      records.set(key(uid, oldId), newId);
    },
    resolve(uid, oldId) {
      return records.get(key(uid, oldId));
    },
    resolveMedia(oldId) {
      return mediaByOldId.get(oldId);
    },
    recordMedia(hash, newId, oldId) {
      mediaByHash.set(hash, newId);
      if (oldId !== undefined) mediaByOldId.set(oldId, newId);
    },
    resolveMediaHash(hash) {
      return mediaByHash.get(hash);
    },
  };
}

export interface RewriteResult {
  fields: Record<string, unknown>;
  /** References that could not be resolved. Reported rather than dropped
   *  silently, because a relation that vanishes on restore looks like data loss
   *  to the person who ran it — and is. */
  unresolved: Array<{ attribute: string; kind: 'relation' | 'media'; identity: string }>;
}

/**
 * Turn archived references back into something the destination will accept.
 *
 * Relations become documentId strings, which the v5 Document Service takes
 * directly; media becomes the numeric file id the upload plugin assigned when
 * the binary was re-uploaded. Anything that cannot be resolved is stripped from
 * the payload and listed, so the write succeeds and the gap is visible, rather
 * than the whole record being rejected for one dangling link.
 */
export function rewriteFields(
  fields: Record<string, unknown>,
  ids: IdMap,
  targetOf: (attribute: string) => string | undefined,
): RewriteResult {
  const unresolved: RewriteResult['unresolved'] = [];

  const rewrite = (value: unknown, attribute: string): unknown => {
    if (Array.isArray(value)) {
      const mapped = value.map((item) => rewrite(item, attribute));
      return mapped.filter((item) => item !== DROP);
    }
    if (typeof value !== 'object' || value === null) return value;

    if (isRelationRef(value)) {
      const uid = targetOf(attribute);
      const resolved = uid ? ids.resolve(uid, value.documentId) : undefined;
      if (resolved === undefined) {
        unresolved.push({ attribute, kind: 'relation', identity: value.documentId });
        return DROP;
      }
      return resolved;
    }

    if (isMediaRef(value)) {
      const resolved = ids.resolveMediaHash(value.hash);
      if (resolved === undefined) {
        unresolved.push({ attribute, kind: 'media', identity: value.hash });
        return DROP;
      }
      return resolved;
    }

    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      const mapped = rewrite(child, childKey);
      if (mapped !== DROP) out[childKey] = mapped;
    }
    return out;
  };

  const result: Record<string, unknown> = {};
  for (const [attribute, value] of Object.entries(fields)) {
    const mapped = rewrite(value, attribute);
    if (mapped === DROP) {
      // A single-valued relation that resolved to nothing becomes null rather
      // than being omitted: omitting it on an update would leave the previous
      // value in place, which is not what the archive says.
      result[attribute] = null;
      continue;
    }
    result[attribute] = mapped;
  }

  return { fields: result, unresolved };
}

/** Sentinel for "this reference resolved to nothing". */
const DROP = Symbol('unresolved-reference');
