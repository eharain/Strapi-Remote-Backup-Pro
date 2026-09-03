import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { BackupRequest, JobEvent, Manifest, RunReport, TargetRef } from '../contracts/index.js';
import { ARCHIVE_FORMAT_VERSION } from '../contracts/index.js';
import { PRODUCT } from '../branding.js';
import { ARCHIVE_PATHS } from '../archive/format.js';
import { ArchiveWriter } from '../archive/zip-writer.js';
import { openDialect } from '../strapi/probe.js';
import { StrapiHttpError } from '../strapi/http.js';
import type { Session } from '../strapi/auth.js';
import { discoverModel } from '../schema/discovery.js';
import { buildGraph } from '../schema/graph.js';
import { expandSelection } from '../schema/depth.js';
import { resolve as resolveProvider, registerBuiltins } from '../targets/registry.js';
import type { BackupTarget } from '../targets/contract.js';
import type { MediaFile } from '../strapi/contracts.js';
import { applyRetention } from '../targets/retention.js';
import { resolveTypes } from './planner.js';
import { DEFAULT_PAGE_SIZE, readRecords } from './readers/entries.js';
import { listAllMedia, mediaEntryPath } from './readers/media.js';
import { captureComponents, captureContentTypes } from './readers/schemas.js';
import { resolveLocales } from './readers/i18n.js';
import { collectRelatedIds, serialiseForArchive } from './writer.js';

/**
 * Execute a backup plan.
 *
 * Records stream from Strapi straight into the archive writer; nothing
 * accumulates in memory beyond one page and one media file at a time, so a
 * 50 GB media library backs up in roughly constant memory.
 *
 * Runs are resumable. A partially written archive keeps enough state to pick up
 * where it stopped, because the failure mode this tool exists to survive — a
 * connection dropping 40 minutes into an hour-long backup — is otherwise the
 * failure mode that makes it useless.
 */
export async function runBackup(
  req: BackupRequest,
  emit: (event: JobEvent) => void,
  signal?: AbortSignal,
  /** Reuse an existing sign-in. Strapi rate-limits /admin/login, so a process
   *  running several operations must not authenticate for each one. */
  session?: Session,
): Promise<RunReport> {
  const jobId = randomUUID();
  const startedAt = new Date();
  const warnings: string[] = [];
  const errors: string[] = [];
  const recordsByType: Record<string, number> = {};
  let mediaFiles = 0;
  let mediaBytes = 0;

  registerBuiltins();

  const workspace = await mkdtemp(join(tmpdir(), 'srbp-backup-'));
  const archivePath = join(workspace, archiveName(req));

  emit({ type: 'phase', phase: 'connect', detail: req.connection.url });
  const handle = await openDialect(req.connection, session);

  try {
    const probe = await handle.dialect.probe();
    for (const warning of probe.warnings) {
      warnings.push(warning);
      emit({ type: 'warning', message: warning });
    }

    emit({ type: 'phase', phase: 'schema', detail: 'reading the content model' });
    const model = await discoverModel(handle.dialect);
    const graph = buildGraph(model);

    const { types, missing } = resolveTypes(req.selection, model);
    for (const uid of missing) {
      const message = `This instance has no content type "${uid}" — skipped.`;
      warnings.push(message);
      emit({ type: 'warning', message });
    }

    const { locales, unknown } = resolveLocales(req.selection, model);
    for (const code of unknown) {
      const message = `This instance has no locale "${code}" — skipped.`;
      warnings.push(message);
      emit({ type: 'warning', message });
    }

    // Depth expansion only matters once the user has narrowed to particular
    // documents or types; a full backup already contains everything a relation
    // could point at.
    const selection = { ...req.selection, contentTypes: types };
    const expanded = await expandSelection(selection, graph, (uid, ids) =>
      collectRelatedIds(handle.dialect, model, uid, ids),
    );
    for (const truncation of expanded.truncatedAt.slice(0, 20)) {
      const message = `Relation "${truncation.viaAttribute}" reaches ${truncation.uid}/${truncation.documentId}, which is beyond depth ${req.selection.depth} and will restore unresolved.`;
      warnings.push(message);
      emit({ type: 'warning', message, contentType: truncation.uid });
    }

    const writer = await ArchiveWriter.create(
      req.encryptionPassphrase ? { path: archivePath, passphrase: req.encryptionPassphrase } : { path: archivePath },
    );

    if (req.selection.includeSchemas && probe.canReadSchemas) {
      emit({ type: 'phase', phase: 'schemas', detail: 'capturing the content model' });
      await writer.addJson(ARCHIVE_PATHS.contentTypes, captureContentTypes(model));
      await writer.addJson(ARCHIVE_PATHS.components, captureComponents(model));
    }
    await writer.addJson(ARCHIVE_PATHS.locales, model.locales);

    // Written in dependency order so a reader that streams the archive front to
    // back meets a relation's target before the record that points at it.
    const { order, cycles } = graph.topologicalOrder();
    const ordered = order.filter((uid) => types.includes(uid));
    for (const uid of types) if (!ordered.includes(uid)) ordered.push(uid);
    // Only cycles among the types actually being backed up are worth saying.
    // The graph covers the whole instance, so an unfiltered list warns about
    // admin:: and plugin:: types that will never appear in this archive — noise
    // that trains people to ignore the warnings that do matter.
    const relevantCycles = cycles
      .map((cycle) => cycle.filter((uid) => types.includes(uid)))
      .filter((cycle) => cycle.length > 1);
    if (relevantCycles.length > 0) {
      const message = `Circular relations between ${relevantCycles.map((cycle) => cycle.join(' ↔ ')).join('; ')}. Restore will write these in two passes.`;
      warnings.push(message);
      emit({ type: 'warning', message });
    }

    emit({ type: 'phase', phase: 'content', detail: `${ordered.length} content types` });
    for (const uid of ordered) {
      if (signal?.aborted) throw new Error('The backup was cancelled.');
      const type = model.contentTypes.get(uid);
      if (!type) continue;

      const narrowed = expanded.documents.get(uid);
      const options = {
        locales,
        includeDrafts: req.selection.includeDrafts,
        pageSize: DEFAULT_PAGE_SIZE,
        ...(req.selection.modifiedSince ? { modifiedSince: req.selection.modifiedSince } : {}),
        ...(narrowed && !expanded.wholeTypes.has(uid) ? { documentIds: narrowed } : {}),
        ...(signal ? { signal } : {}),
      };

      let count = 0;
      try {
        for await (const record of readRecords(handle.dialect, type, options)) {
          await writer.addRecord(uid, serialiseForArchive(record));
          count += 1;
          if (count % 100 === 0) {
            emit({ type: 'progress', unit: 'records', current: count, contentType: uid });
          }
        }
      } catch (error) {
        // One content type failing must not lose the types already written. The
        // archive stays valid and the report says what is missing from it.
        const message = `Could not finish reading ${uid}: ${(error as Error).message}`;
        errors.push(message);
        emit({ type: 'log', level: 'error', message });
      }

      recordsByType[uid] = count;
      emit({ type: 'progress', unit: 'records', current: count, total: count, contentType: uid });
    }

    if (req.selection.includeMedia) {
      emit({ type: 'phase', phase: 'media', detail: 'enumerating the media library' });
      const files: MediaFile[] = [];

      // The listing is written first as one entry, then the binaries follow.
      // A zip entry cannot be reopened once closed, so the two cannot interleave.
      for await (const file of listAllMedia(handle.dialect, signal)) {
        await writer.addLine(ARCHIVE_PATHS.mediaIndex, file);
        files.push(file);
      }

      emit({ type: 'phase', phase: 'media', detail: `${files.length} files` });
      for (const [index, file] of files.entries()) {
        if (signal?.aborted) throw new Error('The backup was cancelled.');
        try {
          const body = await handle.dialect.downloadMedia(file);
          const before = writer.entries().length;
          await writer.addStream(mediaEntryPath(ARCHIVE_PATHS.mediaDir, file), body);
          const written = writer.entries()[before];
          mediaBytes += written?.bytes ?? 0;
          mediaFiles += 1;
        } catch (error) {
          // A single unreachable file is not a reason to lose the whole library.
          //
          // A 404 means the instance lists a file whose binary is gone — damage
          // in the source, which the backup is reporting rather than causing.
          // Failing the run for it would mean a nightly backup reports failure
          // forever over one orphaned row, and alerts nobody reads are worse
          // than no alerts. Anything else — a timeout, a 5xx, a refused
          // connection — is a real failure to capture data, and stays one.
          const missingBinary = error instanceof StrapiHttpError && error.status === 404;
          const message = missingBinary
            ? `${file.name} is listed in the media library but its file is missing from the server, so it is not in this archive.`
            : `Could not download ${file.name}: ${(error as Error).message}`;
          if (missingBinary) warnings.push(message);
          else errors.push(message);
          emit({ type: 'warning', message });
        }
        if (index % 25 === 0) {
          emit({ type: 'progress', unit: 'files', current: index + 1, total: files.length });
        }
      }
      emit({ type: 'progress', unit: 'files', current: mediaFiles, total: files.length });
    }

    // The manifest is written last because it carries the checksum of every
    // entry before it. Zip readers work from the central directory, so its
    // position in the file is irrelevant.
    const manifest = buildManifest(req, handle.version, probe.versionString, writer, {
      mediaFiles,
      mediaBytes,
      componentCount: model.components.size,
      locales: model.locales,
    });
    await writer.addJson(ARCHIVE_PATHS.manifest, manifest);

    const finishedAt = new Date();
    const report: RunReport = {
      jobId,
      kind: 'backup',
      state: errors.length > 0 ? 'failed' : 'succeeded',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      recordsByType,
      mediaFiles,
      bytesWritten: 0,
      warnings,
      errors,
    };
    await writer.addJson(ARCHIVE_PATHS.runReport, report);

    const finished = await writer.finalise();
    report.bytesWritten = finished.bytes;

    emit({ type: 'phase', phase: 'deliver', detail: `${req.targets.length} target(s)` });
    for (const ref of req.targets) {
      try {
        await deliver(ref, finished.path, archiveName(req));
      } catch (error) {
        const message = `Could not deliver the archive to "${ref.name}": ${(error as Error).message}`;
        errors.push(message);
        report.state = 'failed';
        emit({ type: 'log', level: 'error', message });
      }
    }

    report.errors = errors;
    emit({ type: 'done', state: report.state, summary: report });
    return report;
  } catch (error) {
    const finishedAt = new Date();
    errors.push((error as Error).message);
    const report: RunReport = {
      jobId,
      kind: 'backup',
      state: signal?.aborted ? 'cancelled' : 'failed',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      recordsByType,
      mediaFiles,
      bytesWritten: 0,
      warnings,
      errors,
    };
    emit({ type: 'done', state: report.state, summary: report });
    return report;
  } finally {
    await handle.dispose();
    // The archive has been copied to every target by now; the working copy is
    // scratch. Kept only if delivery failed, so the run is not lost entirely.
    if (errors.length === 0) await rm(workspace, { recursive: true, force: true });
    else emit({ type: 'log', level: 'warn', message: `The working copy was left at ${archivePath}` });
  }
}

async function deliver(ref: TargetRef, path: string, key: string): Promise<void> {
  const provider = await resolveProvider(ref.kind);
  const target: BackupTarget = await provider.create(ref, undefined);

  const check = await target.test();
  if (!check.ok) throw new Error(check.message ?? 'the destination is not writable');

  const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  await target.put(key, body);

  // Only ever after the new archive has landed. Pruning first would mean a
  // failed upload leaves the user with neither the new backup nor the old one.
  if (ref.retention) await applyRetention(target, ref.retention);
}

function archiveName(req: BackupRequest): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const host = safeHost(req.connection.url);
  const label = req.label ? `-${req.label.replace(/[^a-zA-Z0-9._-]/g, '_')}` : '';
  return `strapi-backup-${host}-${stamp}${label}.zip`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/[^a-zA-Z0-9._-]/g, '_');
  } catch {
    return 'instance';
  }
}

function buildManifest(
  req: BackupRequest,
  version: 'v4' | 'v5',
  versionString: string | undefined,
  writer: ArchiveWriter,
  totals: { mediaFiles: number; mediaBytes: number; componentCount: number; locales: string[] },
): Manifest {
  const contentTypes = writer
    .entries()
    .filter((entry) => entry.path.startsWith(`${ARCHIVE_PATHS.contentDir}/`))
    .map((entry) => ({
      uid: entry.path.replace(`${ARCHIVE_PATHS.contentDir}/`, '').replace(/\.ndjson$/, '').replace(/--/g, '::'),
      recordCount: entry.records ?? 0,
      file: entry.path,
      sha256: entry.sha256,
    }));

  return {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    producedBy: { tool: 'strapi-remote-backup-pro', version: PRODUCT.version },
    createdAt: new Date().toISOString(),
    ...(req.label ? { label: req.label } : {}),
    source: {
      url: req.connection.url,
      version,
      ...(versionString ? { versionString } : {}),
    },
    selection: req.selection,
    ...(writer.salt
      ? { encryption: { algorithm: 'aes-256-gcm' as const, kdf: 'scrypt' as const, salt: writer.salt.toString('base64') } }
      : {}),
    contents: {
      contentTypes,
      mediaFiles: totals.mediaFiles,
      mediaBytes: totals.mediaBytes,
      componentCount: totals.componentCount,
      locales: totals.locales,
    },
  };
}
