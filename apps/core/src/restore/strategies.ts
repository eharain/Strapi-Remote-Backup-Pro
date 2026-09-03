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
  strategy: ConflictStrategy,
  existing: unknown | null,
  _incoming: unknown,
): StrategyDecision {
  const present = existing !== null && existing !== undefined;

  switch (strategy) {
    case 'create':
      // Deliberately blind to what is already there. Used when the destination
      // is meant to end up with a second copy — cloning into a staging instance
      // rather than reconciling with one.
      return { action: 'create', reason: 'strategy is create: always insert' };

    case 'upsert':
      return present
        ? { action: 'update', reason: 'a document with this identity already exists' }
        : { action: 'create', reason: 'no document with this identity exists' };

    case 'skip':
      return present
        ? { action: 'skip', reason: 'a document with this identity already exists' }
        : { action: 'create', reason: 'no document with this identity exists' };

    case 'replace':
      return present
        ? { action: 'replace', reason: 'existing document will be deleted and reinserted' }
        : { action: 'create', reason: 'no document with this identity exists' };

    default: {
      // Exhaustiveness: a new strategy added to the contract lands here as a
      // compile error rather than silently behaving like one of the others.
      const exhaustive: never = strategy;
      throw new Error(`Unknown conflict strategy: ${String(exhaustive)}`);
    }
  }
}
