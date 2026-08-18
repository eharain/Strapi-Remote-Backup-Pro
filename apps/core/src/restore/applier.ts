import type { JobEvent, RunReport } from '../contracts/index.js';
import type { RestorePlan } from './planner.js';

/**
 * Write a restore plan into a live instance.
 *
 * Two passes. The first writes records in dependency order with circular
 * relations left empty; the second patches those relations once every target
 * exists. Schemas with cycles — which is most real schemas — cannot be restored
 * any other way without the CMS rejecting half the writes.
 */
export async function applyRestore(
  _plan: RestorePlan,
  _emit: (event: JobEvent) => void,
  _signal?: AbortSignal,
): Promise<RunReport> {
  throw new Error('not implemented');
}
