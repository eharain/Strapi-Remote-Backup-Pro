import type { ConflictStrategy } from '../contracts/index.js';

/**
 * How an incoming record meets one that already exists.
 *
 * `upsert` is the default because it is the least surprising. `replace` deletes
 * before writing and is the only strategy that can lose data the archive does
 * not contain, so callers must opt into it explicitly.
 */
export interface StrategyDecision {
  action: 'create' | 'update' | 'skip' | 'replace';
  reason: string;
}

export function decide(
  _strategy: ConflictStrategy,
  _existing: unknown | null,
  _incoming: unknown,
): StrategyDecision {
  throw new Error('not implemented');
}
