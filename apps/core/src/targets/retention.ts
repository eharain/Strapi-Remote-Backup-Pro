/**
 * Prune old archives per a target's retention policy.
 *
 * Runs only after a new archive has been confirmed written. Deleting yesterday's
 * backup before today's has landed is the single most damaging bug a backup tool
 * can have, so ordering here is not an optimisation detail.
 */
import type { BackupTarget, StoredArchive } from './contract.js';

export interface RetentionPolicy {
  keepLast?: number | undefined;
  keepDays?: number | undefined;
}

export interface RetentionResult {
  removed: string[];
  kept: number;
}

export async function applyRetention(
  target: BackupTarget,
  policy: RetentionPolicy,
  now: Date = new Date(),
): Promise<RetentionResult> {
  if (policy.keepLast === undefined && policy.keepDays === undefined) {
    return { removed: [], kept: 0 };
  }

  const archives = await target.list();
  const newestFirst = [...archives].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const doomed = newestFirst.filter((archive, index) => !survives(archive, index, policy, now));

  // A policy that would delete everything is a misconfiguration, not an
  // instruction. Refusing it costs some disk; obeying it costs the backups.
  if (doomed.length >= newestFirst.length && newestFirst.length > 0) {
    return { removed: [], kept: newestFirst.length };
  }

  const removed: string[] = [];
  for (const archive of doomed) {
    await target.remove(archive.key);
    removed.push(archive.key);
  }
  return { removed, kept: newestFirst.length - removed.length };
}

/**
 * Both rules are protective, not restrictive: an archive survives if *either*
 * keeps it. "Keep the last 5" and "keep 30 days" together means the last five
 * plus anything younger than a month, which is what people mean when they set
 * both — not the intersection, which would quietly delete more than either rule
 * asked for.
 */
function survives(archive: StoredArchive, index: number, policy: RetentionPolicy, now: Date): boolean {
  if (policy.keepLast !== undefined && index < policy.keepLast) return true;
  if (policy.keepDays !== undefined) {
    const ageDays = (now.getTime() - archive.createdAt.getTime()) / 86_400_000;
    if (ageDays <= policy.keepDays) return true;
  }
  return false;
}
