import type { RestoreOptions } from '../contracts/index.js';
import type { Manifest } from '../contracts/archive.js';
import type { ContentModel } from '../schema/discovery.js';

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

export async function planRestore(
  _manifest: Manifest,
  _options: RestoreOptions,
  _liveModel: ContentModel,
): Promise<RestorePlan> {
  throw new Error('not implemented');
}
