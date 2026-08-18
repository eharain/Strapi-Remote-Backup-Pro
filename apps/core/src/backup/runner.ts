import type { BackupRequest, JobEvent, RunReport } from '../contracts/index.js';

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
  _req: BackupRequest,
  _emit: (event: JobEvent) => void,
  _signal?: AbortSignal,
): Promise<RunReport> {
  throw new Error('not implemented');
}
