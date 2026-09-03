import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BackupTarget, StoredArchive, TargetProvider } from './contract.js';
import type { TargetRef } from '../contracts/index.js';

/** Local or network-mounted folder. Settings: { directory }. */
class LocalTarget implements BackupTarget {
  readonly kind = 'local' as const;

  constructor(
    readonly id: string,
    private readonly directory: string,
  ) {}

  async test(): Promise<{ ok: boolean; message?: string }> {
    try {
      await mkdir(this.directory, { recursive: true });
      await access(this.directory, constants.W_OK);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: `Cannot write to ${this.directory}: ${(error as Error).message}`,
      };
    }
  }

  async put(key: string, body: ReadableStream<Uint8Array>): Promise<StoredArchive> {
    const destination = this.pathFor(key);
    await mkdir(this.directory, { recursive: true });
    // Written to a neighbouring .part file and renamed once complete. A reader
    // that finds a half-written archive and treats it as a backup is worse than
    // one that finds no archive at all.
    const staging = `${destination}.part`;
    await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(staging));
    const { rename } = await import('node:fs/promises');
    await rename(staging, destination);

    const info = await stat(destination);
    return { key, name: key, size: info.size, createdAt: info.mtime };
  }

  async get(key: string): Promise<ReadableStream<Uint8Array>> {
    return Readable.toWeb(createReadStream(this.pathFor(key))) as ReadableStream<Uint8Array>;
  }

  async list(prefix?: string): Promise<StoredArchive[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }

    const out: StoredArchive[] = [];
    for (const name of names) {
      if (prefix && !name.startsWith(prefix)) continue;
      if (name.endsWith('.part')) continue;
      const info = await stat(join(this.directory, name)).catch(() => null);
      if (!info?.isFile()) continue;
      out.push({ key: name, name, size: info.size, createdAt: info.mtime });
    }
    return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /**
   * Resolve a key inside the configured directory, and refuse anything that
   * escapes it.
   *
   * Keys reach here from an archive listing or a restore request, which means
   * they can carry `../` from a file someone else produced. Retention would then
   * delete outside the backup folder.
   */
  private pathFor(key: string): string {
    if (isAbsolute(key) || key.includes('\0')) {
      throw new Error(`"${key}" is not a valid archive name for a local target.`);
    }
    const root = resolve(this.directory);
    const candidate = resolve(root, key);
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      throw new Error(`"${key}" would resolve outside ${root}.`);
    }
    return candidate;
  }
}

export const provider: TargetProvider = {
  kind: 'local',
  create: async (ref: TargetRef) => {
    const directory = ref.settings['directory'];
    if (typeof directory !== 'string' || directory.trim() === '') {
      throw new Error(`Local target "${ref.name}" needs a "directory" setting.`);
    }
    return new LocalTarget(ref.id, resolve(directory));
  },
};
