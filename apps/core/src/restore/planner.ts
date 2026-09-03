import type { RestoreOptions } from '../contracts/index.js';
import type { Manifest } from '../contracts/archive.js';
import type { ContentModel } from '../schema/discovery.js';
import type { RelationGraph } from '../schema/graph.js';
import type { ArchiveReader } from '../archive/zip-reader.js';
import type { ContentTypeDef, StrapiDialect } from '../strapi/contracts.js';
import { ARCHIVE_PATHS } from '../archive/format.js';
import { decide } from './strategies.js';

/**
 * Work out exactly what a restore would change, without changing anything.
 *
 * Restore is the dangerous half of this tool — it writes to a live CMS — so the
 * plan is a first-class output, not a debugging aid. The desktop app shows it as
 * a diff and requires confirmation; `--dry-run` prints the same thing.
 */
export interface RestorePlan {
  creates: Array<{ uid: string; documentId: string }>;
  updates: Array<{ uid: string; documentId: string; changedFields: string[] }>;
  deletes: Array<{ uid: string; documentId: string }>;
  skips: Array<{ uid: string; documentId: string; reason: string }>;
  mediaUploads: number;
  /** Order to apply types in, derived from the relation graph. */
  applyOrder: string[];
  /** Relations that will land unresolved because their target is neither in the
   *  archive nor already present in the instance. */
  danglingRelations: Array<{ uid: string; documentId: string; attribute: string; target: string }>;
  /** The archive's schema versus the live instance's. A field that no longer
   *  exists, or changed type, is reported here rather than failing mid-write. */
  schemaDrift: Array<{ uid: string; issue: string; severity: 'warn' | 'error' }>;
}

/** What the planner needs beyond the manifest to produce a real diff. */
export interface RestorePlanInputs {
  reader: ArchiveReader;
  dialect: StrapiDialect;
  graph: RelationGraph;
}

export async function planRestore(
  manifest: Manifest,
  options: RestoreOptions,
  liveModel: ContentModel,
  inputs?: RestorePlanInputs,
): Promise<RestorePlan> {
  const plan: RestorePlan = {
    creates: [],
    updates: [],
    deletes: [],
    skips: [],
    mediaUploads: 0,
    applyOrder: [],
    danglingRelations: [],
    schemaDrift: [],
  };

  const archived = manifest.contents.contentTypes.map((entry) => entry.uid);
  const wanted = options.selection.contentTypes.length > 0
    ? archived.filter((uid) => options.selection.contentTypes.includes(uid))
    : archived;

  if (!inputs) {
    plan.applyOrder = wanted;
    return plan;
  }

  plan.applyOrder = orderTypes(wanted, inputs.graph);
  plan.schemaDrift = await detectDrift(inputs.reader, liveModel, wanted);

  // Only ids are collected here, never payloads. A restore of a 200k-record
  // archive has to be plannable without holding the archive in memory, so the
  // applier streams the records again rather than the plan carrying them.
  for (const uid of plan.applyOrder) {
    const type = liveModel.contentTypes.get(uid);
    if (!type) {
      plan.schemaDrift.push({
        uid,
        issue: 'This content type does not exist in the destination instance. Its records cannot be restored.',
        severity: 'error',
      });
      continue;
    }

    const wantedIds = options.selection.documentIds[uid];
    const seen = new Set<string>();
    const documentIds: string[] = [];
    for await (const raw of inputs.reader.records(uid)) {
      const record = raw as { documentId?: string };
      const documentId = record.documentId;
      if (!documentId || seen.has(documentId)) continue;
      if (wantedIds && wantedIds.length > 0 && !wantedIds.includes(documentId)) continue;
      seen.add(documentId);
      documentIds.push(documentId);
    }

    const existing = await findExisting(inputs.dialect, type, documentIds);

    for (const documentId of documentIds) {
      const decision = decide(options.strategy, existing.has(documentId) ? existing.get(documentId) : null, null);
      switch (decision.action) {
        case 'create':
          plan.creates.push({ uid, documentId });
          break;
        case 'update':
          plan.updates.push({ uid, documentId, changedFields: [] });
          break;
        case 'replace':
          plan.deletes.push({ uid, documentId });
          plan.creates.push({ uid, documentId });
          break;
        case 'skip':
          plan.skips.push({ uid, documentId, reason: decision.reason });
          break;
      }
    }
  }

  if (options.restoreMedia) {
    let mediaCount = 0;
    for await (const entry of inputs.reader.media()) if (entry) mediaCount += 1;
    plan.mediaUploads = mediaCount;
  }

  return plan;
}

/**
 * Which archived documents already exist in the destination.
 *
 * Asked in chunks rather than one request per document: a 5,000-record restore
 * would otherwise open with 5,000 round trips against a live CMS before writing
 * anything at all.
 */
async function findExisting(
  dialect: StrapiDialect,
  type: ContentTypeDef,
  documentIds: string[],
): Promise<Map<string, unknown>> {
  const existing = new Map<string, unknown>();
  if (documentIds.length === 0) return existing;

  if (type.kind === 'singleType') {
    const current = await dialect.fetchSingle(type.uid);
    if (current) for (const id of documentIds) existing.set(id, current);
    return existing;
  }

  const chunkSize = 50;
  for (let index = 0; index < documentIds.length; index += chunkSize) {
    const chunk = documentIds.slice(index, index + chunkSize);
    const found = await dialect.fetchByIds(type.uid, chunk);
    for (const record of found) existing.set(record.documentId, record);
  }
  return existing;
}

/**
 * Compare the schema the archive captured against the one that is live now.
 *
 * Reported rather than enforced. A missing field is a warning because the rest
 * of the record still restores usefully; a missing content type is an error
 * because none of it can.
 */
async function detectDrift(
  reader: ArchiveReader,
  liveModel: ContentModel,
  types: string[],
): Promise<RestorePlan['schemaDrift']> {
  const drift: RestorePlan['schemaDrift'] = [];
  const captured = await reader.readJson<ContentTypeDef[]>(ARCHIVE_PATHS.contentTypes);
  if (!captured) return drift;

  const archivedTypes = new Map(captured.map((type) => [type.uid, type]));

  for (const uid of types) {
    const before = archivedTypes.get(uid);
    const now = liveModel.contentTypes.get(uid);
    if (!before) continue;
    if (!now) {
      drift.push({ uid, issue: 'The destination has no such content type.', severity: 'error' });
      continue;
    }

    for (const [name, attribute] of Object.entries(before.attributes)) {
      const current = now.attributes[name];
      if (!current) {
        drift.push({ uid, issue: `Field "${name}" no longer exists — its values will be dropped.`, severity: 'warn' });
        continue;
      }
      if (current.type !== attribute.type) {
        drift.push({
          uid,
          issue: `Field "${name}" changed type from ${attribute.type} to ${current.type} — its values may be rejected.`,
          severity: 'warn',
        });
      }
      if (attribute.type === 'relation' && current.target !== attribute.target) {
        drift.push({
          uid,
          issue: `Relation "${name}" now points at ${String(current.target)} instead of ${String(attribute.target)}.`,
          severity: 'warn',
        });
      }
    }
  }

  return drift;
}

/**
 * Dependency order, so a relation's target is written before the record that
 * points at it. Types inside a cycle keep a stable position and are reconciled
 * by the applier's second pass.
 */
function orderTypes(types: string[], graph: RelationGraph): string[] {
  const { order } = graph.topologicalOrder();
  const wanted = new Set(types);
  const ordered = order.filter((uid) => wanted.has(uid));
  for (const uid of types) if (!ordered.includes(uid)) ordered.push(uid);
  return ordered;
}
