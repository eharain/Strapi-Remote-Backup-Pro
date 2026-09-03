import type { AttributeDef } from '../strapi/contracts.js';
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

export function buildGraph(model: ContentModel): RelationGraph {
  const edges: RelationEdge[] = [];

  for (const [uid, type] of model.contentTypes) {
    collectEdges(uid, type.attributes, model, edges, undefined, new Set());
  }

  const outgoingIndex = new Map<string, RelationEdge[]>();
  const incomingIndex = new Map<string, RelationEdge[]>();
  for (const edge of edges) {
    push(outgoingIndex, edge.from, edge);
    push(incomingIndex, edge.to, edge);
  }

  return {
    edges,
    outgoing: (uid) => outgoingIndex.get(uid) ?? [],
    incoming: (uid) => incomingIndex.get(uid) ?? [],
    topologicalOrder: () => topologicalOrder([...model.contentTypes.keys()], edges),
  };
}

/**
 * Walk a set of attributes, following components and dynamic zones inline.
 *
 * `seenComponents` guards against a component that contains itself, directly or
 * through a chain. Strapi permits that, and without the guard this recurses
 * until the stack gives out — on a schema that the CMS itself considers valid.
 */
function collectEdges(
  owner: string,
  attributes: Record<string, AttributeDef>,
  model: ContentModel,
  out: RelationEdge[],
  viaComponent: string | undefined,
  seenComponents: Set<string>,
): void {
  for (const [name, attribute] of Object.entries(attributes)) {
    if (attribute.type === 'relation' && attribute.target) {
      const edge: RelationEdge = {
        from: owner,
        to: attribute.target,
        attribute: name,
        relation: attribute.relation ?? 'unknown',
      };
      if (viaComponent !== undefined) edge.viaComponent = viaComponent;
      out.push(edge);
      continue;
    }

    if (attribute.type === 'component' && attribute.component) {
      descend(owner, attribute.component, model, out, seenComponents);
      continue;
    }

    if (attribute.type === 'dynamiczone' && attribute.components) {
      for (const componentUid of attribute.components) {
        descend(owner, componentUid, model, out, seenComponents);
      }
    }
  }
}

function descend(
  owner: string,
  componentUid: string,
  model: ContentModel,
  out: RelationEdge[],
  seenComponents: Set<string>,
): void {
  if (seenComponents.has(componentUid)) return;
  const component = model.components.get(componentUid);
  if (!component) return;

  const nested = new Set(seenComponents);
  nested.add(componentUid);
  collectEdges(owner, component.attributes, model, out, componentUid, nested);
}

function push(index: Map<string, RelationEdge[]>, key: string, edge: RelationEdge): void {
  const list = index.get(key);
  if (list) list.push(edge);
  else index.set(key, [edge]);
}

/**
 * Kahn's algorithm for the order, Tarjan for what is left over.
 *
 * A schema with no cycles sorts completely and `cycles` is empty. A real schema
 * usually has at least one — article points at author, author points back at
 * articles — so the types inside a cycle are appended in a stable order and
 * named in `cycles`, and it is the applier's job to write them in two passes.
 */
function topologicalOrder(nodes: string[], edges: RelationEdge[]): { order: string[]; cycles: string[][] } {
  const dependencies = new Map<string, Set<string>>();
  for (const node of nodes) dependencies.set(node, new Set());

  for (const edge of edges) {
    // Self-references impose no ordering: a record pointing at its own type is
    // resolved in the second pass regardless.
    if (edge.from === edge.to) continue;
    if (!dependencies.has(edge.from) || !dependencies.has(edge.to)) continue;
    // `from` needs `to` to exist first.
    dependencies.get(edge.from)?.add(edge.to);
  }

  const order: string[] = [];
  const remaining = new Set(nodes);

  for (;;) {
    const ready = [...remaining]
      .filter((node) => {
        const deps = dependencies.get(node);
        if (!deps) return true;
        for (const dep of deps) if (remaining.has(dep)) return false;
        return true;
      })
      .sort();

    if (ready.length === 0) break;
    for (const node of ready) {
      order.push(node);
      remaining.delete(node);
    }
  }

  const cycles = remaining.size > 0 ? findCycles([...remaining], dependencies) : [];
  // Everything still unplaced is inside a cycle. It still has to be written, so
  // it is appended in a stable order rather than dropped.
  for (const node of [...remaining].sort()) order.push(node);

  return { order, cycles };
}

/** Tarjan's strongly connected components, restricted to the unplaced nodes. */
function findCycles(nodes: string[], dependencies: Map<string, Set<string>>): string[][] {
  const scope = new Set(nodes);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of dependencies.get(node) ?? []) {
      if (!scope.has(next)) continue;
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      for (;;) {
        const popped = stack.pop();
        if (popped === undefined) break;
        onStack.delete(popped);
        component.push(popped);
        if (popped === node) break;
      }
      if (component.length > 1) components.push(component.sort());
    }
  };

  for (const node of nodes) {
    if (!index.has(node)) visit(node);
  }
  return components;
}
