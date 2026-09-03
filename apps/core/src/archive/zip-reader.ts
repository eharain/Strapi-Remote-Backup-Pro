/**
 * Streaming zip reader.
 *
 * The manifest is always readable without a passphrase, even for encrypted
 * archives, so a UI can list what an archive holds before asking the user to
 * unlock it. Content entries are yielded record by record rather than parsed
 * whole, mirroring the writer.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { ARCHIVE_PATHS, contentEntryPath } from './format.js';
import { decryptStream, deriveKey } from './crypto.js';

export interface ArchiveReaderOptions {
  path: string;
  passphrase?: string;
}

interface ManifestShape {
  formatVersion?: string;
  encryption?: { salt?: string };
  contents?: {
    contentTypes?: Array<{ uid: string; file: string; sha256: string; recordCount?: number }>;
  };
}

export class ArchiveReader {
  private constructor(
    private readonly zip: ZipFile,
    private readonly entries: Map<string, Entry>,
    private readonly manifest: ManifestShape,
    private readonly key: Buffer | null,
  ) {}

  static async open(options: ArchiveReaderOptions): Promise<ArchiveReader> {
    const zip = await openZip(options.path);
    const entries = await indexEntries(zip);

    const manifestEntry = entries.get(ARCHIVE_PATHS.manifest);
    if (!manifestEntry) {
      zip.close();
      throw new Error(
        `${options.path} is not a Strapi Remote Backup Pro archive — it has no ${ARCHIVE_PATHS.manifest}.`,
      );
    }

    // Read before deriving any key: the manifest carries the salt, and it is
    // stored in the clear precisely so this step never needs the passphrase.
    const manifest = JSON.parse(
      (await collect(await rawStream(zip, manifestEntry))).toString('utf8'),
    ) as ManifestShape;

    let key: Buffer | null = null;
    if (manifest.encryption?.salt) {
      if (!options.passphrase) {
        zip.close();
        throw new Error('This archive is encrypted. A passphrase is required to read anything but its manifest.');
      }
      key = await deriveKey(options.passphrase, Buffer.from(manifest.encryption.salt, 'base64'));
      try {
        await verifyPassphrase(zip, entries, key);
      } catch (error) {
        zip.close();
        throw error;
      }
    }

    return new ArchiveReader(zip, entries, manifest, key);
  }

  async readManifest(): Promise<unknown> {
    return this.manifest;
  }

  /** Content-type UIDs this archive actually holds an entry for. */
  contentTypes(): string[] {
    return (this.manifest.contents?.contentTypes ?? []).map((entry) => entry.uid);
  }

  async *records(uid: string): AsyncIterable<unknown> {
    const path = contentEntryPath(uid);
    const entry = this.entries.get(path);
    if (!entry) return;

    const stream = await this.openEntry(entry);
    let carry = '';
    for await (const chunk of stream) {
      carry += (chunk as Buffer).toString('utf8');
      let newline = carry.indexOf('\n');
      while (newline !== -1) {
        const line = carry.slice(0, newline).trim();
        carry = carry.slice(newline + 1);
        if (line) yield JSON.parse(line);
        newline = carry.indexOf('\n');
      }
    }
    const tail = carry.trim();
    if (tail) yield JSON.parse(tail);
  }

  /** Media metadata, one line per file. */
  async *media(): AsyncIterable<unknown> {
    const entry = this.entries.get(ARCHIVE_PATHS.mediaIndex);
    if (!entry) return;
    const stream = await this.openEntry(entry);
    let carry = '';
    for await (const chunk of stream) {
      carry += (chunk as Buffer).toString('utf8');
      let newline = carry.indexOf('\n');
      while (newline !== -1) {
        const line = carry.slice(0, newline).trim();
        carry = carry.slice(newline + 1);
        if (line) yield JSON.parse(line);
        newline = carry.indexOf('\n');
      }
    }
    const tail = carry.trim();
    if (tail) yield JSON.parse(tail);
  }

  async readJson<T>(path: string): Promise<T | null> {
    const entry = this.entries.get(path);
    if (!entry) return null;
    const body = await collect(await this.openEntry(entry));
    return JSON.parse(body.toString('utf8')) as T;
  }

  async openMedia(hash: string): Promise<ReadableStream<Uint8Array>> {
    const entry = this.findMedia(hash);
    if (!entry) throw new Error(`The archive holds no media file with hash "${hash}".`);
    const stream = await this.openEntry(entry);
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  hasMedia(hash: string): boolean {
    return this.findMedia(hash) !== undefined;
  }

  /** Verify every entry against the checksums in the manifest. */
  async verify(): Promise<{ ok: boolean; corrupted: string[] }> {
    const corrupted: string[] = [];
    for (const declared of this.manifest.contents?.contentTypes ?? []) {
      const entry = this.entries.get(declared.file);
      if (!entry) {
        corrupted.push(declared.file);
        continue;
      }
      // Hashed as stored, not as decrypted — which is what lets an encrypted
      // archive be checked for damage without anyone supplying a passphrase.
      const hash = createHash('sha256');
      const stream = await rawStream(this.zip, entry);
      for await (const chunk of stream) hash.update(chunk as Buffer);
      if (hash.digest('hex') !== declared.sha256) corrupted.push(declared.file);
    }
    return { ok: corrupted.length === 0, corrupted };
  }

  close(): void {
    this.zip.close();
  }

  private findMedia(hash: string): Entry | undefined {
    const prefix = `${ARCHIVE_PATHS.mediaDir}/${hash}`;
    for (const [name, entry] of this.entries) {
      // Stored as <hash><ext>, and the extension is not known from the hash
      // alone, so match on the stem rather than reconstructing the filename.
      if (name === prefix || name.startsWith(`${prefix}.`)) return entry;
    }
    return undefined;
  }

  private async openEntry(entry: Entry): Promise<Readable> {
    const stream = await rawStream(this.zip, entry);
    if (!this.key || entry.fileName === ARCHIVE_PATHS.manifest) return stream;
    return stream.pipe(decryptStream(this.key));
  }
}

/**
 * Confirm the passphrase before handing back a reader.
 *
 * AES-GCM only proves the key was right when the authentication tag is checked,
 * and the tag is the last thing in the entry. A streaming decrypt therefore
 * emits plausible-looking garbage all the way to the end before failing — so a
 * caller parsing NDJSON as it arrives hits "unexpected token" on binary noise
 * and never learns the real cause.
 *
 * The smallest encrypted entry is decrypted in full here, which costs almost
 * nothing and turns a wrong passphrase into one clear message at the moment the
 * archive is opened. It also means no unauthenticated plaintext reaches a caller
 * that only ever reads one entry.
 */
async function verifyPassphrase(zip: ZipFile, entries: Map<string, Entry>, key: Buffer): Promise<void> {
  let smallest: Entry | undefined;
  for (const [name, entry] of entries) {
    if (name === ARCHIVE_PATHS.manifest) continue;
    if (!smallest || entry.uncompressedSize < smallest.uncompressedSize) smallest = entry;
  }
  if (!smallest) return;

  try {
    const stream = (await rawStream(zip, smallest)).pipe(decryptStream(key));
    for await (const chunk of stream) void chunk;
  } catch {
    throw new Error(
      'The archive could not be decrypted. Either the passphrase is wrong or the file has been altered.',
    );
  }
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error(`Could not open ${path} as a zip archive.`));
      else resolve(zip);
    });
  });
}

/**
 * Read the whole central directory up front.
 *
 * Restore needs random access — a media file by hash, one content type out of
 * forty — and yauzl only surfaces entries by walking them. Forty thousand entry
 * headers is a few megabytes; the alternative is re-walking the archive for
 * every lookup.
 */
function indexEntries(zip: ZipFile): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Entry>();
    zip.on('entry', (entry: Entry) => {
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', reject);
    zip.readEntry();
  });
}

function rawStream(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error(`Could not read ${entry.fileName} from the archive.`));
      else resolve(stream);
    });
  });
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
