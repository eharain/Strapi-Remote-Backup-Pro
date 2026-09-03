import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { JobEvent, Manifest, RestoreRequest, RunReport, TargetRef } from '../contracts/index.js';
import { ManifestSchema } from '../contracts/index.js';
import { ArchiveReader } from '../archive/zip-reader.js';
import { openDialect } from '../strapi/probe.js';
import type { Session } from '../strapi/auth.js';
import { discoverModel } from '../schema/discovery.js';
import { buildGraph } from '../schema/graph.js';
import { registerBuiltins, resolve as resolveProvider } from '../targets/registry.js';
import { planRestore } from './planner.js';
import type { RestorePlan } from './planner.js';
import { applyRestore } from './applier.js';

/**
 * Read an archive and write it into a live instance.
 *
 * The counterpart to runBackup, and the more dangerous of the two: this is the
 * one that changes someone's CMS. The plan is always produced before anything is
 * written, and `options.dryRun` stops after it.
 */
export async function runRestore(
  req: RestoreRequest,
  emit: (event: JobEvent) => void,
  signal?: AbortSignal,
  /** Reuse an existing sign-in — see runBackup. */
  session?: Session,
): Promise<RunReport> {
  registerBuiltins();

  const workspace = await mkdtemp(join(tmpdir(), 'srbp-restore-'));
  let archivePath: string;

  try {
    emit({ type: 'phase', phase: 'fetch', detail: req.archivePath });
    archivePath = await materialise(req.source, req.archivePath, workspace);

    const reader = await ArchiveReader.open(
      req.decryptionPassphrase ? { path: archivePath, passphrase: req.decryptionPassphrase } : { path: archivePath },
    );

    try {
      const rawManifest = await reader.readManifest();
      const manifest: Manifest = ManifestSchema.parse(rawManifest);

      const major = Number(manifest.formatVersion.split('.')[0]);
      if (Number.isFinite(major) && major > 1) {
        throw new Error(
          `This archive uses format version ${manifest.formatVersion}, which this build cannot read. Update the tool and try again.`,
        );
      }

      emit({ type: 'phase', phase: 'verify', detail: 'checking the archive is intact' });
      const integrity = await reader.verify();
      if (!integrity.ok) {
        // Refused outright. Restoring from an archive that failed its own
        // checksums means writing corrupted records into a live CMS, which is
        // strictly worse than not restoring at all.
        throw new Error(
          `The archive is damaged — these entries do not match their checksums: ${integrity.corrupted.join(', ')}`,
        );
      }

      emit({ type: 'phase', phase: 'connect', detail: req.connection.url });
      const handle = await openDialect(req.connection, session);

      try {
        if (handle.version !== manifest.source.version) {
          emit({
            type: 'warning',
            message: `This archive came from Strapi ${manifest.source.version} and is being restored into ${handle.version}. Record identities and field shapes differ between the two.`,
          });
        }

        emit({ type: 'phase', phase: 'schema', detail: 'reading the destination content model' });
        const model = await discoverModel(handle.dialect);
        const graph = buildGraph(model);

        emit({ type: 'phase', phase: 'plan', detail: 'working out what would change' });
        const plan = await planRestore(manifest, req.options, model, {
          reader,
          dialect: handle.dialect,
          graph,
        });
        emit({ type: 'log', level: 'info', message: summarise(plan) });

        return await applyRestore(plan, emit, signal, {
          reader,
          dialect: handle.dialect,
          model,
          options: req.options,
        });
      } finally {
        await handle.dispose();
      }
    } finally {
      reader.close();
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/**
 * Get the archive onto local disk.
 *
 * A local target is read where it lies; everything else is downloaded to a
 * scratch directory first, because the zip reader needs random access and no
 * remote target offers it.
 */
async function materialise(source: TargetRef, key: string, workspace: string): Promise<string> {
  if (source.kind === 'local') {
    const directory = source.settings['directory'];
    if (isAbsolute(key)) return key;
    if (typeof directory === 'string' && directory) return join(directory, key);
    return key;
  }

  const provider = await resolveProvider(source.kind);
  const target = await provider.create(source, undefined);
  const destination = join(workspace, basename(key));
  const body = await target.get(key);
  await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destination));
  return destination;
}

export function summarise(plan: RestorePlan): string {
  const parts = [
    `${plan.creates.length} to create`,
    `${plan.updates.length} to update`,
    `${plan.deletes.length} to delete`,
    `${plan.skips.length} skipped`,
    `${plan.mediaUploads} media files`,
  ];
  if (plan.schemaDrift.length > 0) parts.push(`${plan.schemaDrift.length} schema differences`);
  return parts.join(', ');
}
