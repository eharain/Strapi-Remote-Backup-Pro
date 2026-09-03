/**
 * Back up one instance, restore into another, back that one up, and compare.
 *
 * The only test that can say backup and restore work, because the thing under
 * test is Strapi's admin API and a mock would keep passing precisely when Strapi
 * changed. Needs two live instances — see test/integration/README.md.
 *
 * Records are compared by value, never by identity. Strapi assigns its own
 * documentId on insert, so a record the restore had to recreate cannot be
 * matched by id — and matching by id is exactly what let a bug that turned every
 * write into an update go unnoticed.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BackupRequestSchema,
  ConnectionSchema,
  RestoreRequestSchema,
} from '../../src/contracts/index.js';
import type { Connection, JobEvent, RunReport } from '../../src/contracts/index.js';
import { authenticate } from '../../src/strapi/auth.js';
import type { Session } from '../../src/strapi/auth.js';
import { openDialect } from '../../src/strapi/probe.js';
import { runBackup } from '../../src/backup/runner.js';
import { runRestore } from '../../src/restore/runner.js';
import { ArchiveReader } from '../../src/archive/zip-reader.js';
import { isMediaRef, isRelationRef } from '../../src/strapi/shared.js';

const SOURCE = process.env['SRBP_SOURCE_URL'] ?? 'http://127.0.0.1:13337';
const TARGET = process.env['SRBP_TARGET_URL'] ?? 'http://127.0.0.1:13338';
const EMAIL = process.env['SRBP_EMAIL'] ?? '';
const PASSWORD = process.env['SRBP_PASSWORD'] ?? '';
const OUT = process.env['SRBP_OUT'] ?? join(tmpdir(), 'srbp-integration');

/**
 * Sessions are cached on disk across runs.
 *
 * Strapi rate-limits POST /admin/login to a handful of attempts per window. A
 * suite that signs in on every run locks itself out after three iterations, and
 * the failure looks like a broken test rather than a working rate limiter.
 */
const SESSION_CACHE = join(tmpdir(), 'srbp-integration-sessions.json');

interface Doc {
  documentId: string;
  publishedAt?: string | null;
  fields: Record<string, unknown>;
}

const configured = EMAIL !== '' && PASSWORD !== '';
const suite = configured ? describe : describe.skip;

function connectionTo(url: string): Connection {
  return ConnectionSchema.parse({
    url,
    credentials: { kind: 'admin', email: EMAIL, password: PASSWORD },
  });
}

async function sessionFor(url: string): Promise<Session> {
  let cache: Record<string, { token: string; expiresAt?: string }> = {};
  try {
    cache = JSON.parse(await readFile(SESSION_CACHE, 'utf8')) as typeof cache;
  } catch {
    cache = {};
  }
  const hit = cache[url];
  if (hit && (!hit.expiresAt || Date.parse(hit.expiresAt) - 60_000 > Date.now())) {
    return hit.expiresAt
      ? { token: hit.token, kind: 'admin', expiresAt: new Date(hit.expiresAt) }
      : { token: hit.token, kind: 'admin' };
  }
  const fresh = await authenticate(connectionTo(url));
  cache[url] = fresh.expiresAt
    ? { token: fresh.token, expiresAt: fresh.expiresAt.toISOString() }
    : { token: fresh.token };
  await writeFile(SESSION_CACHE, JSON.stringify(cache), 'utf8');
  return fresh;
}

const silent = (_event: JobEvent): void => undefined;

/** What must survive the trip, with everything instance-local removed. */
function comparable(fields: Record<string, unknown>): unknown {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== 'object' || value === null) return value;
    // A media file's hash is regenerated on every upload and its byte size
    // changes because the upload plugin re-encodes images, so the portable
    // identity is the original filename.
    if (isMediaRef(value)) return { media: value.name };
    if (isRelationRef(value)) return { relation: value.documentId };
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) out[key] = walk(child);
    return out;
  };
  return walk(fields);
}

function fingerprint(doc: Doc): string {
  return `${doc.publishedAt ? 'published' : 'draft'}|${JSON.stringify(comparable(doc.fields))}`;
}

async function readArchive(path: string): Promise<Map<string, Doc[]>> {
  const reader = await ArchiveReader.open({ path });
  try {
    const out = new Map<string, Doc[]>();
    for (const uid of reader.contentTypes()) {
      const docs: Doc[] = [];
      for await (const raw of reader.records(uid)) docs.push(raw as Doc);
      out.set(uid, docs);
    }
    return out;
  } finally {
    reader.close();
  }
}

async function latestArchive(): Promise<string> {
  const names = (await readdir(OUT)).filter((name) => name.endsWith('.zip')).sort();
  const latest = names[names.length - 1];
  if (!latest) throw new Error(`no archive was written to ${OUT}`);
  return join(OUT, latest);
}

async function backup(url: string, session: Session, label: string): Promise<RunReport> {
  return runBackup(
    BackupRequestSchema.parse({
      connection: connectionTo(url),
      selection: {},
      targets: [{ id: 'out', kind: 'local', name: 'out', settings: { directory: OUT } }],
      label,
    }),
    silent,
    undefined,
    session,
  );
}

suite('backup and restore round trip', () => {
  let sourceSession: Session;
  let targetSession: Session;
  let archiveA: string;
  let docsA: Map<string, Doc[]>;
  let sacrificedTitle = '';
  let restoreReport: RunReport;
  let backupBReport: RunReport;
  let docsB: Map<string, Doc[]>;

  beforeAll(async () => {
    await mkdir(OUT, { recursive: true });
    sourceSession = await sessionFor(SOURCE);
    targetSession = await sessionFor(TARGET);

    const backupA = await backup(SOURCE, sourceSession, 'roundtrip-a');
    expect(backupA.state).toBe('succeeded');
    archiveA = await latestArchive();
    docsA = await readArchive(archiveA);

    const handle = await openDialect(connectionTo(TARGET), targetSession);
    try {
      // Determinism: strays left by an earlier run would otherwise make each run
      // start from a different place, and would let a create-path test delete
      // some leftover instead of the record it meant to.
      for (const [uid, docs] of docsA) {
        const known = new Set(docs.map((doc) => doc.documentId));
        const live = new Set<string>();
        let page = 1;
        for (;;) {
          const result = await handle.dialect.fetchPage(uid, { page, pageSize: 100 });
          for (const record of result.items) live.add(record.documentId);
          if (!result.hasMore || result.items.length === 0) break;
          page += 1;
        }
        for (const documentId of live) {
          if (!known.has(documentId)) await handle.dialect.deleteRecord(uid, documentId);
        }
      }

      // Remove one record the archive holds, so the run exercises inserting as
      // well as updating. Located by value: once the restore has recreated a
      // record, Strapi has given it an id of its own and the archived one no
      // longer addresses anything.
      const articles = docsA.get('api::article.article') ?? [];
      sacrificedTitle = String(articles.find((doc) => doc.publishedAt)?.fields['title'] ?? '');
      if (sacrificedTitle) {
        let page = 1;
        for (;;) {
          const result = await handle.dialect.fetchPage('api::article.article', { page, pageSize: 100 });
          for (const record of result.items) {
            if (String(record.fields['title'] ?? '') === sacrificedTitle) {
              await handle.dialect.deleteRecord('api::article.article', record.documentId);
            }
          }
          if (!result.hasMore || result.items.length === 0) break;
          page += 1;
        }
      }
    } finally {
      await handle.dispose();
    }

    restoreReport = await runRestore(
      RestoreRequestSchema.parse({
        connection: connectionTo(TARGET),
        source: { id: 'in', kind: 'local', name: 'in', settings: { directory: OUT } },
        archivePath: archiveA.split(/[\\/]/).pop(),
        options: { selection: {}, strategy: 'upsert', dryRun: false },
      }),
      silent,
      undefined,
      targetSession,
    );

    backupBReport = await backup(TARGET, targetSession, 'roundtrip-b');
    docsB = await readArchive(await latestArchive());
  }, 600_000);

  it('backs the source up without errors', () => {
    expect(docsA.size).toBeGreaterThan(0);
    expect([...docsA.values()].reduce((sum, docs) => sum + docs.length, 0)).toBeGreaterThan(0);
  });

  it('restores without errors', () => {
    expect(restoreReport.errors).toEqual([]);
    expect(restoreReport.state).toBe('succeeded');
  });

  it('backs the destination up without errors', () => {
    expect(backupBReport.errors).toEqual([]);
    expect(backupBReport.state).toBe('succeeded');
  });

  it('round-trips every record with identical values and publication state', () => {
    for (const [uid, aDocs] of docsA) {
      const bDocs = docsB.get(uid);
      expect(bDocs, `${uid} is missing from the destination archive`).toBeDefined();

      const available = new Map<string, number>();
      for (const doc of bDocs ?? []) {
        const key = fingerprint(doc);
        available.set(key, (available.get(key) ?? 0) + 1);
      }

      const missing: string[] = [];
      for (const doc of aDocs) {
        const key = fingerprint(doc);
        const count = available.get(key) ?? 0;
        if (count <= 0) missing.push(key);
        else available.set(key, count - 1);
      }

      expect(missing, `${uid}: ${missing.length} record(s) did not survive the round trip`).toEqual([]);
    }
  });

  it('recreates a record the destination no longer had, exactly once', () => {
    const articles = docsB.get('api::article.article') ?? [];
    const matches = articles.filter((doc) => doc.fields['title'] === sacrificedTitle);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.filter((doc) => doc.publishedAt)).toHaveLength(1);
  });

  it('reconnects relations on a recreated record', () => {
    const articles = docsB.get('api::article.article') ?? [];
    const matches = articles.filter((doc) => doc.fields['title'] === sacrificedTitle);
    for (const doc of matches) {
      expect(doc.fields['author'], 'the relation was not reconnected after the insert').toBeTruthy();
    }
  });

  it('does not duplicate media it has already uploaded', async () => {
    const readerA = await ArchiveReader.open({ path: archiveA });
    const readerB = await ArchiveReader.open({ path: await latestArchive() });
    try {
      const namesA: string[] = [];
      for await (const file of readerA.media()) namesA.push(String((file as { name: string }).name));
      const namesB: string[] = [];
      for await (const file of readerB.media()) namesB.push(String((file as { name: string }).name));

      for (const name of namesA) expect(namesB, `${name} did not reach the destination`).toContain(name);
      expect(namesB.length, 'the restore uploaded a second copy of files already present').toBe(
        new Set(namesB).size,
      );
    } finally {
      readerA.close();
      readerB.close();
    }
  });
});
