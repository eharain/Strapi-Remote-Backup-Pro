import { describe, expect, it, vi } from 'vitest';
import { applyRetention } from '../../src/targets/retention.js';
import type { BackupTarget, StoredArchive } from '../../src/targets/contract.js';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function fakeTarget(archives: StoredArchive[]): BackupTarget & { removed: string[] } {
  const removed: string[] = [];
  return {
    kind: 'local',
    id: 'test',
    removed,
    test: async () => ({ ok: true }),
    put: vi.fn(),
    get: vi.fn(),
    list: async () => archives,
    remove: async (key: string) => {
      removed.push(key);
    },
  } as unknown as BackupTarget & { removed: string[] };
}

function archive(key: string, days: number): StoredArchive {
  return { key, name: key, size: 100, createdAt: daysAgo(days) };
}

describe('applyRetention', () => {
  it('does nothing when no policy is set', async () => {
    const target = fakeTarget([archive('a.zip', 1), archive('b.zip', 40)]);
    const result = await applyRetention(target, {}, NOW);
    expect(result.removed).toEqual([]);
    expect(target.removed).toEqual([]);
  });

  it('keeps the newest N', async () => {
    const target = fakeTarget([archive('new.zip', 1), archive('mid.zip', 2), archive('old.zip', 3)]);
    const result = await applyRetention(target, { keepLast: 2 }, NOW);
    expect(result.removed).toEqual(['old.zip']);
  });

  it('keeps anything younger than keepDays', async () => {
    const target = fakeTarget([archive('recent.zip', 5), archive('ancient.zip', 90)]);
    const result = await applyRetention(target, { keepDays: 30 }, NOW);
    expect(result.removed).toEqual(['ancient.zip']);
  });

  it('treats the two rules as a union, not an intersection', async () => {
    // "keep the last 5" and "keep 30 days" together means the last five plus
    // anything younger than a month. The intersection would quietly delete more
    // than either rule asked for.
    const target = fakeTarget([
      archive('a.zip', 1),
      archive('b.zip', 2),
      archive('c.zip', 40),
      archive('d.zip', 50),
    ]);
    const result = await applyRetention(target, { keepLast: 3, keepDays: 30 }, NOW);
    expect(result.removed).toEqual(['d.zip']);
  });

  it('refuses a policy that would delete every archive', async () => {
    // A policy that empties the folder is a misconfiguration, not an
    // instruction. Refusing it costs some disk; obeying it costs the backups.
    const target = fakeTarget([archive('a.zip', 100), archive('b.zip', 200)]);
    const result = await applyRetention(target, { keepDays: 30 }, NOW);
    expect(result.removed).toEqual([]);
    expect(target.removed).toEqual([]);
    expect(result.kept).toBe(2);
  });

  it('does nothing when the target holds no archives', async () => {
    const target = fakeTarget([]);
    const result = await applyRetention(target, { keepLast: 1 }, NOW);
    expect(result.removed).toEqual([]);
  });
});
