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
export interface IdMap {
  record(uid: string, oldId: string, newId: string): void;
  resolve(uid: string, oldId: string): string | undefined;
  resolveMedia(oldId: number): number | undefined;
}

export function createIdMap(): IdMap {
  throw new Error('not implemented');
}
