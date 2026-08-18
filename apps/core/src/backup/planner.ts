import type { Selection } from '../contracts/index.js';
import type { ContentModel } from '../schema/discovery.js';

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

export async function planBackup(
  _selection: Selection,
  _model: ContentModel,
): Promise<BackupPlan> {
  throw new Error('not implemented');
}
