import type { Selection } from '../contracts/index.js';
import type { RelationGraph } from './graph.js';

/**
 * Expand a user's selection outwards along relations.
 *
 * This is what makes "restore just these articles" produce something usable
 * rather than a set of records pointing at authors and categories that do not
 * exist. Starting from the explicitly chosen types and documents, each hop pulls
 * in the records those records refer to, up to `selection.depth`.
 *
 * Expansion is breadth-first and deduplicated by (uid, documentId): a heavily
 * interlinked schema will otherwise revisit the same records exponentially, and
 * at depth 3 or beyond that is the difference between a backup and a denial of
 * service against the user's own CMS.
 */
export interface ExpandedSelection {
  /** Documents to fetch, keyed by content-type UID. */
  documents: Map<string, Set<string>>;
  /** Types to fetch in full, because no document filter narrowed them. */
  wholeTypes: Set<string>;
  /** Records that were referenced but fell outside the depth limit. They are
   *  reported so the UI can warn that some relations will land unresolved. */
  truncatedAt: Array<{ uid: string; documentId: string; viaAttribute: string }>;
}

export async function expandSelection(
  _selection: Selection,
  _graph: RelationGraph,
  _fetchRelated: (uid: string, ids: string[]) => Promise<Map<string, string[]>>,
): Promise<ExpandedSelection> {
  throw new Error('not implemented');
}
