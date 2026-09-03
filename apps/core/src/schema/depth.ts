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

/**
 * Look up which documents a set of records point at.
 *
 * Returns target-type UID → the document ids referenced. Keyed by target type
 * rather than by attribute because that is the unit the next hop fetches in;
 * which attribute produced the reference is recovered from the graph when a
 * truncation has to be reported.
 */
export type FetchRelated = (uid: string, ids: string[]) => Promise<Map<string, string[]>>;

export async function expandSelection(
  selection: Selection,
  graph: RelationGraph,
  fetchRelated: FetchRelated,
): Promise<ExpandedSelection> {
  const documents = new Map<string, Set<string>>();
  const wholeTypes = new Set<string>();
  const truncatedAt: ExpandedSelection['truncatedAt'] = [];
  const seen = new Set<string>();

  const selectedTypes = new Set(selection.contentTypes);
  const admits = (uid: string): boolean => selection.followUnselectedTypes || selectedTypes.has(uid);

  // The starting set: types the user named, split by whether they narrowed them
  // to particular documents.
  let frontier: Array<{ uid: string; documentId: string }> = [];
  for (const uid of selection.contentTypes) {
    const ids = selection.documentIds[uid];
    if (ids && ids.length > 0) {
      for (const documentId of ids) {
        if (add(documents, seen, uid, documentId)) frontier.push({ uid, documentId });
      }
    } else {
      wholeTypes.add(uid);
    }
  }

  // A type taken in full drags its relation targets in at type granularity.
  // Expanding those document by document would mean enumerating every record
  // just to discover it is already included.
  expandWholeTypes(wholeTypes, graph, selection.depth, admits);

  for (let hop = 0; hop < selection.depth && frontier.length > 0; hop += 1) {
    const byType = groupByType(frontier);
    const next: Array<{ uid: string; documentId: string }> = [];
    const lastHop = hop === selection.depth - 1;

    for (const [uid, ids] of byType) {
      const related = await fetchRelated(uid, ids);
      for (const [targetUid, targetIds] of related) {
        if (!admits(targetUid)) continue;
        // Already covered by a whole-type fetch — no point listing documents.
        if (wholeTypes.has(targetUid)) continue;

        for (const targetId of targetIds) {
          if (lastHop) {
            // One hop further than the user allowed. Recorded rather than
            // fetched, so the UI can say which relations will land unresolved
            // instead of the archive quietly containing dangling references.
            if (!seen.has(key(targetUid, targetId))) {
              truncatedAt.push({
                uid: targetUid,
                documentId: targetId,
                viaAttribute: attributeBetween(graph, uid, targetUid),
              });
            }
            continue;
          }
          if (add(documents, seen, targetUid, targetId)) next.push({ uid: targetUid, documentId: targetId });
        }
      }
    }

    frontier = next;
  }

  return { documents, wholeTypes, truncatedAt };
}

/**
 * Close the whole-type set over relations, one hop per level of depth.
 *
 * Bounded by `depth` like the document-level walk, so "everything, depth 0"
 * stays exactly what the user asked for rather than quietly becoming the whole
 * database through a chain of relations.
 */
function expandWholeTypes(
  wholeTypes: Set<string>,
  graph: RelationGraph,
  depth: number,
  admits: (uid: string) => boolean,
): void {
  let frontier = [...wholeTypes];
  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const uid of frontier) {
      for (const edge of graph.outgoing(uid)) {
        if (!admits(edge.to) || wholeTypes.has(edge.to)) continue;
        wholeTypes.add(edge.to);
        next.push(edge.to);
      }
    }
    frontier = next;
  }
}

function key(uid: string, documentId: string): string {
  // NUL separator: a content-type UID can contain colons and dots, and a
  // documentId is opaque, so any printable separator risks a collision between
  // two different pairs that happen to concatenate the same way.
  return `${uid}\u0000${documentId}`;
}

function add(
  documents: Map<string, Set<string>>,
  seen: Set<string>,
  uid: string,
  documentId: string,
): boolean {
  const composite = key(uid, documentId);
  if (seen.has(composite)) return false;
  seen.add(composite);
  const bucket = documents.get(uid);
  if (bucket) bucket.add(documentId);
  else documents.set(uid, new Set([documentId]));
  return true;
}

function groupByType(items: Array<{ uid: string; documentId: string }>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const list = grouped.get(item.uid);
    if (list) list.push(item.documentId);
    else grouped.set(item.uid, [item.documentId]);
  }
  return grouped;
}

function attributeBetween(graph: RelationGraph, from: string, to: string): string {
  const edge = graph.outgoing(from).find((candidate) => candidate.to === to);
  return edge?.attribute ?? '(unknown)';
}
