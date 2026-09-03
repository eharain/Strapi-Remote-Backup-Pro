import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARCHIVE_PATHS, contentEntryPath, uidFromEntryPath } from '../../src/archive/format.js';
import { ArchiveWriter } from '../../src/archive/zip-writer.js';
import { ArchiveReader } from '../../src/archive/zip-reader.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'srbp-test-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function bytes(text: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(Readable.from([Buffer.from(text, 'utf8')])) as ReadableStream<Uint8Array>;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function build(path: string, passphrase?: string): Promise<ArchiveWriter> {
  const writer = await ArchiveWriter.create(passphrase ? { path, passphrase } : { path });
  await writer.addRecord('api::article.article', { documentId: 'a1', fields: { title: 'One' } });
  await writer.addRecord('api::article.article', { documentId: 'a2', fields: { title: 'Two' } });
  await writer.addRecord('api::author.author', { documentId: 'w1', fields: { name: 'Writer' } });
  await writer.addStream(`${ARCHIVE_PATHS.mediaDir}/hash1.png`, bytes('PNGDATA'));
  await writer.addLine(ARCHIVE_PATHS.mediaIndex, { hash: 'hash1', name: 'one.png' });

  const manifest = {
    formatVersion: '1.0',
    ...(writer.salt
      ? { encryption: { algorithm: 'aes-256-gcm', kdf: 'scrypt', salt: writer.salt.toString('base64') } }
      : {}),
    contents: {
      contentTypes: writer
        .entries()
        .filter((entry) => entry.path.startsWith(`${ARCHIVE_PATHS.contentDir}/`))
        .map((entry) => ({
          uid: uidFromEntryPath(entry.path),
          recordCount: entry.records ?? 0,
          file: entry.path,
          sha256: entry.sha256,
        })),
    },
  };
  await writer.addJson(ARCHIVE_PATHS.manifest, manifest);
  await writer.finalise();
  return writer;
}

describe('archive entry paths', () => {
  it('round-trips a content-type uid through the entry name', () => {
    const path = contentEntryPath('api::article.article');
    expect(path).toBe('content/api--article.article.ndjson');
    expect(uidFromEntryPath(path)).toBe('api::article.article');
  });
});

describe('archive round trip', () => {
  it('writes and reads records, media and checksums', async () => {
    const path = join(dir, 'plain.zip');
    await build(path);

    const reader = await ArchiveReader.open({ path });
    try {
      expect(reader.contentTypes().sort()).toEqual(['api::article.article', 'api::author.author']);

      const articles: unknown[] = [];
      for await (const record of reader.records('api::article.article')) articles.push(record);
      expect(articles).toEqual([
        { documentId: 'a1', fields: { title: 'One' } },
        { documentId: 'a2', fields: { title: 'Two' } },
      ]);

      expect(reader.hasMedia('hash1')).toBe(true);
      expect(await drain(await reader.openMedia('hash1'))).toBe('PNGDATA');

      const index: unknown[] = [];
      for await (const entry of reader.media()) index.push(entry);
      expect(index).toEqual([{ hash: 'hash1', name: 'one.png' }]);

      await expect(reader.verify()).resolves.toEqual({ ok: true, corrupted: [] });
    } finally {
      reader.close();
    }
  });

  it('yields nothing for a content type the archive does not hold', async () => {
    const path = join(dir, 'plain2.zip');
    await build(path);
    const reader = await ArchiveReader.open({ path });
    try {
      const found: unknown[] = [];
      for await (const record of reader.records('api::missing.missing')) found.push(record);
      expect(found).toEqual([]);
    } finally {
      reader.close();
    }
  });
});

describe('encrypted archives', () => {
  it('round-trips with the right passphrase', async () => {
    const path = join(dir, 'sealed.zip');
    await build(path, 'a long enough passphrase');

    const reader = await ArchiveReader.open({ path, passphrase: 'a long enough passphrase' });
    try {
      const authors: unknown[] = [];
      for await (const record of reader.records('api::author.author')) authors.push(record);
      expect(authors).toEqual([{ documentId: 'w1', fields: { name: 'Writer' } }]);
      expect(await drain(await reader.openMedia('hash1'))).toBe('PNGDATA');
    } finally {
      reader.close();
    }
  });

  it('leaves the manifest readable without the passphrase', async () => {
    // A UI has to list what an archive holds before asking anyone to unlock it.
    const path = join(dir, 'sealed2.zip');
    await build(path, 'a long enough passphrase');

    await expect(ArchiveReader.open({ path })).rejects.toThrow(/encrypted/i);
  });

  it('rejects a wrong passphrase when the archive is opened, not mid-stream', async () => {
    // GCM only proves the key at the authentication tag, which is the last thing
    // in an entry. Without an up-front check the caller parses binary noise and
    // reports "unexpected token" instead of "wrong passphrase".
    const path = join(dir, 'sealed3.zip');
    await build(path, 'the right passphrase');

    await expect(ArchiveReader.open({ path, passphrase: 'the wrong passphrase' })).rejects.toThrow(
      /could not be decrypted/i,
    );
  });

  it('verifies checksums without needing the passphrase', async () => {
    // Checksums are taken over the stored bytes, so damage can be detected
    // without anyone supplying a key.
    const path = join(dir, 'sealed4.zip');
    const writer = await build(path, 'a long enough passphrase');
    expect(writer.salt).not.toBeNull();

    const reader = await ArchiveReader.open({ path, passphrase: 'a long enough passphrase' });
    try {
      await expect(reader.verify()).resolves.toEqual({ ok: true, corrupted: [] });
    } finally {
      reader.close();
    }
  });
});
