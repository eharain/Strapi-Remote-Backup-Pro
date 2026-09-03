import type { Selection } from '../contracts/index.js';
import type { ContentModel } from '../schema/discovery.js';
import { defaultBackupTypes, isSystemType } from '../schema/discovery.js';
import { resolveLocales } from './readers/i18n.js';

/**
 * Decide what a backup run will actually do, before it does any of it.
 *
 * The plan is produced up front so the UI can show "this will fetch 41,200
 * records across 18 types and 3.2 GB of media" and let the user reconsider,
 * rather than discovering the scale halfway through a run against production.
 */
export interface BackupPlan {
  types: Array<{ uid: string; estimatedRecords: number; locales: string[] }>;
  estimatedMediaFiles: number;
  estimatedMediaBytes: number;
  warnings: string[];
}

/**
 * Counting costs a request per type, so it is optional. Without it the plan
 * still says what will be fetched, just not how much of it — which is the right
 * trade for a CLI run that is about to do the work anyway.
 */
export interface PlanProbes {
  countRecords?: (uid: string) => Promise<number>;
  countMedia?: () => Promise<{ files: number; bytes: number }>;
}

export async function planBackup(
  selection: Selection,
  model: ContentModel,
  probes: PlanProbes = {},
): Promise<BackupPlan> {
  const warnings: string[] = [];
  const { types, missing } = resolveTypes(selection, model);

  for (const uid of missing) {
    warnings.push(`This instance has no content type "${uid}" — it will be skipped.`);
  }
  if (types.length === 0) {
    warnings.push('The selection matched no content types, so this backup would contain no records.');
  }

  const { locales, unknown } = resolveLocales(selection, model);
  for (const code of unknown) {
    warnings.push(`This instance has no locale "${code}" — it will be skipped.`);
  }

  const planned: BackupPlan['types'] = [];
  for (const uid of types) {
    const type = model.contentTypes.get(uid);
    if (!type) continue;

    const narrowed = selection.documentIds[uid];
    let estimatedRecords = narrowed?.length ?? 0;
    if (!narrowed && probes.countRecords) {
      estimatedRecords = await probes.countRecords(uid);
    }

    planned.push({
      uid,
      estimatedRecords,
      locales: type.i18nEnabled && locales.length > 0 ? locales : [],
    });

    if (type.draftAndPublish && selection.includeDrafts) {
      // Both versions of every document are fetched, so the record count the
      // user sees at the end will exceed the document count they expect.
      // Better said here than explained afterwards.
      continue;
    }
  }

  let estimatedMediaFiles = 0;
  let estimatedMediaBytes = 0;
  if (selection.includeMedia && probes.countMedia) {
    const media = await probes.countMedia();
    estimatedMediaFiles = media.files;
    estimatedMediaBytes = media.bytes;
  }

  if (selection.depth > 3) {
    warnings.push(
      `Relation depth ${selection.depth} can expand a selection enormously on an interlinked schema. Expect a long run.`,
    );
  }

  return { types: planned, estimatedMediaFiles, estimatedMediaBytes, warnings };
}

/**
 * Turn a selection into the concrete list of types to read.
 *
 * An empty selection means "the user's own content", not "literally everything":
 * sweeping in admin and plugin types produces archives that fight the target
 * instance on restore, and nobody asking for a backup of their site means the
 * permissions tables.
 */
export function resolveTypes(
  selection: Selection,
  model: ContentModel,
): { types: string[]; missing: string[] } {
  if (selection.contentTypes.length === 0) {
    return { types: defaultBackupTypes(model), missing: [] };
  }

  const types: string[] = [];
  const missing: string[] = [];
  for (const uid of selection.contentTypes) {
    if (!model.contentTypes.has(uid)) missing.push(uid);
    else if (!isSystemType(uid)) types.push(uid);
  }
  return { types, missing };
}
