import { randomUUID } from 'node:crypto';
import type { JobEvent, RestoreOptions, RunReport } from '../contracts/index.js';
import type { RestorePlan } from './planner.js';
import type { ArchiveReader } from '../archive/zip-reader.js';
import type { AttributeDef, MediaFile, StrapiDialect } from '../strapi/contracts.js';
import type { ContentModel } from '../schema/discovery.js';
import type { IdMap } from './remap.js';
import { createIdMap, rewriteFields } from './remap.js';

export interface RestoreContext {
  reader: ArchiveReader;
  dialect: StrapiDialect;
  model: ContentModel;
  options: RestoreOptions;
  ids?: IdMap;
}

interface ArchivedRecord {
  documentId: string;
  locale?: string;
  publishedAt?: string | null;
  fields: Record<string, unknown>;
}

/**
 * Write a restore plan into a live instance.
 *
 * Two passes. The first writes records in dependency order with circular
 * relations left empty; the second patches those relations once every target
 * exists. Schemas with cycles — which is most real schemas — cannot be restored
 * any other way without the CMS rejecting half the writes.
 */
export async function applyRestore(
  plan: RestorePlan,
  emit: (event: JobEvent) => void,
  signal?: AbortSignal,
  context?: RestoreContext,
): Promise<RunReport> {
  const startedAt = new Date();
  const jobId = randomUUID();
  const warnings: string[] = [];
  const errors: string[] = [];
  const recordsByType: Record<string, number> = {};
  let mediaFiles = 0;

  if (!context) {
    throw new Error('applyRestore needs an archive reader and a live dialect to write anything.');
  }
  const { reader, dialect, model, options } = context;
  const ids = context.ids ?? createIdMap();

  const finish = (state: RunReport['state']): RunReport => {
    const finishedAt = new Date();
    return {
      jobId,
      kind: 'restore',
      state,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      recordsByType,
      mediaFiles,
      bytesWritten: 0,
      warnings,
      errors,
    };
  };

  for (const issue of plan.schemaDrift) {
    const message = `${issue.uid}: ${issue.issue}`;
    if (issue.severity === 'error') errors.push(message);
    else warnings.push(message);
    emit({ type: 'warning', message, contentType: issue.uid });
  }

  if (options.dryRun) {
    emit({ type: 'phase', phase: 'plan', detail: 'dry run — nothing was written' });
    emit({ type: 'done', state: 'succeeded', summary: plan });
    return finish('succeeded');
  }

  try {
    // Media first, unconditionally. Every record that carries an image resolves
    // it by hash, so a record written before its media would land with an empty
    // field and no later pass would notice.
    if (options.restoreMedia) {
      mediaFiles = await restoreMedia(reader, dialect, ids, emit, warnings, signal);
    }

    const toWrite = new Set(
      [...plan.creates, ...plan.updates].map((item) => docKey(item.uid, item.documentId)),
    );
    // The plan already established which documents the destination holds. Losing
    // that here makes the first write of every document an insert, so an upsert
    // silently becomes "duplicate everything" — and on any content type with a
    // unique field it fails *after* the duplicates have been created.
    const alreadyPresent = new Set(
      plan.updates.map((item) => docKey(item.uid, item.documentId)),
    );
    const toDelete = new Map<string, Set<string>>();
    for (const item of plan.deletes) {
      const bucket = toDelete.get(item.uid);
      if (bucket) bucket.add(item.documentId);
      else toDelete.set(item.uid, new Set([item.documentId]));
    }

    const deferred: Array<{ uid: string; documentId: string; fields: Record<string, unknown>; published: boolean }> = [];

    emit({ type: 'phase', phase: 'records', detail: `${plan.applyOrder.length} content types` });
    for (const uid of plan.applyOrder) {
      if (signal?.aborted) return finish('cancelled');

      const type = model.contentTypes.get(uid);
      if (!type) continue;
      const targets = targetIndex(type.attributes, model);

      const doomed = toDelete.get(uid);
      if (doomed) {
        for (const documentId of doomed) {
          try {
            await dialect.deleteRecord(uid, documentId);
          } catch (error) {
            warnings.push(`Could not delete ${uid}/${documentId}: ${(error as Error).message}`);
          }
        }
      }

      let written = 0;

      // Two filtered passes rather than one, because the published version has
      // to be written and published before the draft is laid over it. Doing it
      // the other way round would publish the draft's contents and erase the
      // difference between them, which on a live site is a visible change nobody
      // asked for. Streaming twice keeps memory flat; buffering both versions of
      // every document would not.
      for (const phase of ['published', 'draft'] as const) {
        for await (const raw of reader.records(uid)) {
          if (signal?.aborted) return finish('cancelled');
          const record = raw as ArchivedRecord;
          if (!record?.documentId) continue;
          if (!toWrite.has(docKey(uid, record.documentId))) continue;

          const isPublished = record.publishedAt !== null && record.publishedAt !== undefined;
          if (phase === 'published' && !isPublished) continue;
          if (phase === 'draft' && isPublished) continue;

          try {
            const rewritten = rewriteFields(record.fields, ids, (attribute) => targets.get(attribute));
            for (const missing of rewritten.unresolved) {
              // Deferred, not lost: the target may be written later in this same
              // run, which is exactly what a relation cycle looks like.
              plan.danglingRelations.push({
                uid,
                documentId: record.documentId,
                attribute: missing.attribute,
                target: missing.identity,
              });
            }

            const newId = await writeRecord(dialect, type.kind, uid, record, rewritten.fields, ids, {
              exists: alreadyPresent.has(docKey(uid, record.documentId)),
            });
            ids.record(uid, record.documentId, newId);

            if (rewritten.unresolved.length > 0) {
              deferred.push({ uid, documentId: record.documentId, fields: record.fields, published: isPublished });
            }

            if (isPublished && options.preservePublishState && type.draftAndPublish) {
              await dialect.publishRecord(uid, newId);
            }

            written += 1;
            if (written % 50 === 0) {
              emit({ type: 'progress', unit: 'records', current: written, contentType: uid });
            }
          } catch (error) {
            const message = `Could not write ${uid}/${record.documentId}: ${(error as Error).message}`;
            errors.push(message);
            emit({ type: 'log', level: 'error', message });
            if (options.stopOnError) return finish('failed');
          }
        }
      }

      recordsByType[uid] = written;
      emit({ type: 'progress', unit: 'records', current: written, total: written, contentType: uid });
    }

    // Second pass: everything that pointed at a record which had not been
    // written yet. By now it has been, so the relations resolve.
    if (deferred.length > 0) {
      emit({ type: 'phase', phase: 'relations', detail: `${deferred.length} records with forward references` });
      let repaired = 0;
      for (const item of deferred) {
        if (signal?.aborted) return finish('cancelled');
        const type = model.contentTypes.get(item.uid);
        if (!type) continue;
        const targets = targetIndex(type.attributes, model);
        const newId = ids.resolve(item.uid, item.documentId);
        if (!newId) continue;

        const rewritten = rewriteFields(item.fields, ids, (attribute) => targets.get(attribute));
        if (rewritten.unresolved.length === 0) {
          try {
            await dialect.updateRecord(item.uid, newId, {
              documentId: newId,
              fields: rewritten.fields,
            });
            // An update writes the draft version only. Without re-publishing, the
            // live copy keeps the empty relation this pass just repaired, and the
            // site shows an article with no author while the editor shows one.
            if (item.published && options.preservePublishState && type.draftAndPublish) {
              await dialect.publishRecord(item.uid, newId);
            }
            repaired += 1;
          } catch (error) {
            warnings.push(`Could not patch relations on ${item.uid}/${item.documentId}: ${(error as Error).message}`);
          }
        } else {
          for (const missing of rewritten.unresolved) {
            warnings.push(
              `${item.uid}/${item.documentId}: "${missing.attribute}" points at ${missing.kind} ${missing.identity}, which is neither in the archive nor in the destination. It was left empty.`,
            );
          }
        }
      }
      emit({ type: 'progress', unit: 'records', current: repaired, total: deferred.length });
    }

    const state: RunReport['state'] = errors.length > 0 ? 'failed' : 'succeeded';
    const report = finish(state);
    emit({ type: 'done', state, summary: report });
    return report;
  } catch (error) {
    errors.push((error as Error).message);
    const report = finish(signal?.aborted ? 'cancelled' : 'failed');
    emit({ type: 'done', state: report.state, summary: report });
    return report;
  }
}

/**
 * Upload every binary the archive holds, skipping what the destination already
 * has.
 *
 * Matched on folder plus original filename, which is the only identity that
 * survives the trip. Two things that look like better keys are not:
 *
 *  - The hash gets a fresh random suffix on every upload, so the same image has
 *    a different hash in every instance it has ever been added to.
 *  - The byte size changes too, because the upload plugin re-encodes images.
 *    Measured on a real library: a 271,540-byte PNG came back as 247,320, and a
 *    42,710-byte one as 30,730 — up to 28% off. Any size-based match tight
 *    enough to be meaningful rejects every file.
 *
 * Getting this wrong is not subtle: nothing is ever recognised, and the
 * destination gains a duplicate of the entire library on every restore with
 * nothing to clean them up. Folder is part of the key because a library can
 * legitimately hold several `logo.png` in different places.
 */
async function restoreMedia(
  reader: ArchiveReader,
  dialect: StrapiDialect,
  ids: IdMap,
  emit: (event: JobEvent) => void,
  warnings: string[],
  signal?: AbortSignal,
): Promise<number> {
  emit({ type: 'phase', phase: 'media', detail: 'checking what the destination already has' });

  const existing = new Map<string, Array<{ id: number; size: number }>>();
  let page = 1;
  for (;;) {
    const result = await dialect.listMedia({ page, pageSize: 100 });
    for (const file of result.items) {
      const key = mediaKey(file);
      const bucket = existing.get(key);
      if (bucket) bucket.push({ id: file.id, size: file.size });
      else existing.set(key, [{ id: file.id, size: file.size }]);
    }
    if (!result.hasMore || result.items.length === 0) break;
    page += 1;
  }

  let uploaded = 0;
  let reused = 0;
  for await (const raw of reader.media()) {
    if (signal?.aborted) break;
    const file = raw as MediaFile;
    if (!file?.hash) continue;

    const already = matchExisting(existing.get(mediaKey(file)), file.size);
    if (already !== undefined) {
      ids.recordMedia(file.hash, already, file.id);
      reused += 1;
      continue;
    }

    if (!reader.hasMedia(file.hash)) {
      warnings.push(`The archive lists media "${file.name}" but does not contain its bytes.`);
      continue;
    }

    try {
      const body = await reader.openMedia(file.hash);
      const created = await dialect.uploadMedia(file, body);
      ids.recordMedia(file.hash, created.id, file.id);
      uploaded += 1;
      if (uploaded % 25 === 0) emit({ type: 'progress', unit: 'files', current: uploaded });
    } catch (error) {
      warnings.push(`Could not upload ${file.name}: ${(error as Error).message}`);
    }
  }

  emit({ type: 'phase', phase: 'media', detail: `${uploaded} uploaded, ${reused} already present` });
  return uploaded;
}

/**
 * Write one record, choosing insert or update from three sources of truth in
 * order of confidence.
 *
 * First, anything already written during this run — that is how the draft pass
 * lands on the document the published pass just created. Then the plan's own
 * finding that the destination holds this documentId. Only when neither applies
 * is it genuinely new.
 */
/**
 * Composite key for one (content type, document) pair.
 *
 * A named function with a visible separator, because the alternative — an
 * inline template literal at each call site — is how one of these ended up
 * keyed on a NUL while its lookup used a space. Nothing about that is visible
 * in a diff, and the symptom was every upsert silently becoming an insert.
 */
function docKey(uid: string, documentId: string): string {
  return `${uid}|${documentId}`;
}

/**
 * Pick the destination file that is the same file.
 *
 * Candidates have already been narrowed to one folder and filename, which only
 * yields more than one when an earlier run duplicated them — so any of them is
 * the right answer. The closest size wins simply to prefer the least re-encoded
 * copy; size cannot be used to *reject* a candidate, because the upload plugin
 * re-encodes images and shifts their byte count by up to a third.
 */
function matchExisting(
  candidates: Array<{ id: number; size: number }> | undefined,
  size: number,
): number | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  // Several candidates under one folder and filename only happens when an
  // earlier run duplicated them, so any of them is the right answer. The closest
  // size is chosen to prefer the least re-encoded copy.
  let best = candidates[0];
  for (const candidate of candidates) {
    const bestDistance = best === undefined ? Number.POSITIVE_INFINITY : Math.abs(best.size - size);
    if (Math.abs(candidate.size - size) < bestDistance) best = candidate;
  }
  return best === undefined ? undefined : best.id;
}

/**
 * Folder plus filename — see restoreMedia for why nothing else survives.
 *
 * Strapi writes the root folder as both `''` and `'/'` depending on how a file
 * was created, and files uploaded by different tools disagree within one
 * library. Treated literally, the same file in the same place compares unequal
 * and the restore uploads a second copy.
 */
function mediaKey(file: { name: string; folderPath?: string }): string {
  const folder = file.folderPath === undefined || file.folderPath === '' ? '/' : file.folderPath;
  return `${folder}|${file.name}`;
}

async function writeRecord(
  dialect: StrapiDialect,
  kind: 'collectionType' | 'singleType',
  uid: string,
  record: ArchivedRecord,
  fields: Record<string, unknown>,
  ids: IdMap,
  options: { exists: boolean },
): Promise<string> {
  const payload = {
    documentId: record.documentId,
    ...(record.locale !== undefined ? { locale: record.locale } : {}),
    fields,
  };

  const writtenThisRun = ids.resolve(uid, record.documentId);
  if (writtenThisRun) {
    const updated = await dialect.updateRecord(uid, writtenThisRun, payload);
    return updated.documentId || writtenThisRun;
  }

  if (kind === 'singleType') {
    // A single type always exists conceptually; the content manager treats the
    // write as an update of the one document rather than an insert.
    const current = await dialect.fetchSingle(uid);
    if (current) {
      const updated = await dialect.updateRecord(uid, current.documentId, payload);
      return updated.documentId || current.documentId;
    }
  }

  if (options.exists) {
    // v5 documentIds are stable across instances, so the archived id addresses
    // the destination's copy directly.
    const updated = await dialect.updateRecord(uid, record.documentId, payload);
    return updated.documentId || record.documentId;
  }

  const created = await dialect.createRecord(uid, payload);
  return created.documentId;
}

/**
 * Attribute name → the content type it points at, for one content type.
 *
 * Flattened across components so a relation nested inside one is resolvable by
 * name. Two different components using the same attribute name for relations to
 * different types would collide here; that is rare enough to accept, and the
 * consequence is a reported unresolved relation rather than a wrong one.
 */
function targetIndex(
  attributes: Record<string, AttributeDef>,
  model: ContentModel,
  into: Map<string, string> = new Map(),
  seen: Set<string> = new Set(),
): Map<string, string> {
  for (const [name, attribute] of Object.entries(attributes)) {
    if (attribute.type === 'relation' && attribute.target) {
      if (!into.has(name)) into.set(name, attribute.target);
      continue;
    }
    const nested =
      attribute.type === 'component' && attribute.component
        ? [attribute.component]
        : attribute.type === 'dynamiczone' && attribute.components
          ? attribute.components
          : [];
    for (const componentUid of nested) {
      if (seen.has(componentUid)) continue;
      const component = model.components.get(componentUid);
      if (!component) continue;
      const next = new Set(seen);
      next.add(componentUid);
      targetIndex(component.attributes, model, into, next);
    }
  }
  return into;
}
