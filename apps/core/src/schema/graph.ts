import type { ContentModel } from './discovery.js';

/**
 * The relation graph between content types, derived from the content model.
 *
 * Built once per run and reused by both the backup planner (what else do I need
 * to fetch?) and the restore applier (what order must I write these in so that
 * relation targets already exist?).
 */
export interface RelationEdge {
  from: string;
  to: string;
  attribute: string;
  relation: string;
  /** Components and dynamic zones can carry relations too; those are flattened
   *  into edges from the owning content type so callers see one graph. */
  viaComponent?: string;
}

export interface RelationGraph {
  edges: RelationEdge[];
  outgoing(uid: string): RelationEdge[];
  incoming(uid: string): RelationEdge[];
  /**
   * Content types ordered so that every type comes after the types it depends
   * on. Cycles are unavoidable in real schemas (article ↔ author), so this
   * reports them rather than failing: the applier breaks a cycle by writing
   * records first and patching the circular relations in a second pass.
   */
  topologicalOrder(): { order: string[]; cycles: string[][] };
}

export function buildGraph(_model: ContentModel): RelationGraph {
  throw new Error('not implemented');
}
