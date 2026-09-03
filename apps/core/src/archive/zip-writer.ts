/**
 * Streaming zip writer.
 *
 * Entries are appended as their data arrives, so peak memory stays flat
 * regardless of archive size. Zip64 is enabled unconditionally — media libraries
 * cross the 4 GB boundary far more often than people expect, and discovering the
 * limit at the end of a long backup is the worst possible time.
 *
 * SHA-256 is computed inline while writing, so the manifest can record a checksum
 * per entry without a second pass over the finished file.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import type { Archiver } from 'archiver';
import { contentEntryPath } from './format.js';
import { deriveKey, encryptStream, newSalt } from './crypto.js';

export interface EntryInfo {
  path: string;
  /** Of the bytes as stored, so `verify()` works without the passphrase. */
  sha256: string;
  bytes: number;
  records?: number;
}

export interface ArchiveWriterOptions {
  path: string;
  /** Absent means an unencrypted archive. */
  passphrase?: string;
  compressionLevel?: number;
}

export class ArchiveWriter {
  private readonly zip: Archiver;
  private readonly done: Promise<void>;
  private readonly written: EntryInfo[] = [];
  private open: OpenEntry | null = null;
  /** Every mutation is queued. archiver consumes appended streams strictly in
   *  order, so two entries built concurrently would interleave into one. */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly path: string,
    private readonly key: Buffer | null,
    readonly salt: Buffer | null,
    compressionLevel: number,
  ) {
    this.zip = archiver('zip', {
      zlib: { level: compressionLevel },
      forceZip64: true,
    });
    const output = createWriteStream(path);
    this.done = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      this.zip.on('error', reject);
      // A warning archiver can continue past — a missing stat, usually — still
      // means an entry may not be what the manifest claims, so it is promoted.
      this.zip.on('warning', reject);
    });
    this.zip.pipe(output);
  }

  static async create(options: ArchiveWriterOptions): Promise<ArchiveWriter> {
    let key: Buffer | null = null;
    let salt: Buffer | null = null;
    if (options.passphrase) {
      salt = newSalt();
      key = await deriveKey(options.passphrase, salt);
    }
    return new ArchiveWriter(options.path, key, salt, options.compressionLevel ?? 6);
  }

  async addJson(path: string, value: unknown): Promise<void> {
    const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
    // The manifest is never encrypted: a UI has to be able to list an archive's
    // contents before asking anyone for a passphrase.
    await this.addBuffer(path, body, { encrypt: path !== 'manifest.json' });
  }

  /** Append one NDJSON line to an open content entry. */
  async addRecord(uid: string, record: unknown): Promise<void> {
    return this.addLine(contentEntryPath(uid), record);
  }

  /**
   * Append one NDJSON line to any entry, opening it on first use.
   *
   * Switching to a different path closes the previous entry. A zip entry cannot
   * be reopened once closed, so callers must finish one NDJSON file before
   * starting the next — which is also what keeps memory flat.
   */
  async addLine(path: string, value: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.open && this.open.path !== path) await this.closeOpen();
      if (!this.open) this.open = this.beginEntry(path);

      const line = `${JSON.stringify(value)}\n`;
      this.open.records += 1;
      await write(this.open.input, Buffer.from(line, 'utf8'));
    });
  }

  async addStream(path: string, body: ReadableStream<Uint8Array>): Promise<void> {
    return this.enqueue(async () => {
      await this.closeOpen();
      const entry = this.beginEntry(path);
      await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), entry.input);
      await this.finishEntry(entry);
    });
  }

  async finalise(): Promise<{ path: string; bytes: number }> {
    await this.enqueue(async () => {
      await this.closeOpen();
    });
    await this.zip.finalize();
    await this.done;
    const info = await stat(this.path);
    return { path: this.path, bytes: info.size };
  }

  /** What was written, for the manifest. Valid once each entry has closed. */
  entries(): EntryInfo[] {
    return [...this.written];
  }

  private async addBuffer(path: string, body: Buffer, options: { encrypt: boolean }): Promise<void> {
    return this.enqueue(async () => {
      await this.closeOpen();
      const entry = this.beginEntry(path, options.encrypt);
      await write(entry.input, body);
      await this.finishEntry(entry);
    });
  }

  /**
   * Wire up one entry: caller writes plaintext into `input`, which is encrypted
   * if a key is present, then hashed, then handed to archiver.
   *
   * The hash sits after encryption on purpose, so the manifest's checksums
   * describe the bytes actually in the file and `verify()` can check an
   * encrypted archive without being given the passphrase.
   */
  private beginEntry(path: string, encrypt = true): OpenEntry {
    const input = new PassThrough();
    const hash = createHash('sha256');
    let bytes = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    let tail: Readable = input;
    if (this.key && encrypt) tail = tail.pipe(encryptStream(this.key));
    tail = tail.pipe(meter);

    this.zip.append(tail as Readable, { name: path });

    return {
      path,
      input,
      records: 0,
      settled: new Promise<void>((resolve, reject) => {
        tail.on('end', resolve);
        tail.on('error', reject);
      }),
      collect: () => ({ path, sha256: hash.digest('hex'), bytes }),
    };
  }

  private async finishEntry(entry: OpenEntry): Promise<void> {
    entry.input.end();
    await entry.settled;
    const info = entry.collect();
    this.written.push(entry.records > 0 ? { ...info, records: entry.records } : info);
  }

  private async closeOpen(): Promise<void> {
    if (!this.open) return;
    const entry = this.open;
    this.open = null;
    await this.finishEntry(entry);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

interface OpenEntry {
  path: string;
  input: PassThrough;
  records: number;
  settled: Promise<void>;
  collect: () => EntryInfo;
}

/** Write honouring backpressure, so a fast producer cannot outrun the disk. */
function write(stream: PassThrough, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = stream.write(chunk, (error) => {
      if (error) reject(error);
    });
    if (ok) resolve();
    else stream.once('drain', resolve);
  });
}
