/** `strapi-backup inspect <archive>` — what is in this file, without unpacking it. */
import { isAbsolute, resolve } from 'node:path';
import type { Command } from 'commander';
import { ArchiveReader } from '../../archive/zip-reader.js';
import type { Manifest } from '../../contracts/index.js';
import { formatBytes } from '../render.js';

export function registerInspect(program: Command): void {
  program
    .command('inspect')
    .argument('<archive>', 'path to the .zip archive')
    .description('Show what an archive contains')
    .option('--decrypt <passphrase>', 'passphrase, only needed to read past the manifest')
    .option('--json', 'print the manifest as JSON')
    .action(async (archive: string, flags: Record<string, string | boolean | undefined>) => {
      const path = isAbsolute(archive) ? archive : resolve(archive);
      const passphrase = flags['decrypt'];
      // The manifest is readable without a passphrase by design, so an encrypted
      // archive can still be listed by someone deciding whether to unlock it.
      const reader = await ArchiveReader.open(
        typeof passphrase === 'string' ? { path, passphrase } : { path },
      ).catch(async (error: unknown) => {
        if (typeof passphrase === 'string') throw error;
        return ArchiveReader.open({ path });
      });

      try {
        const manifest = (await reader.readManifest()) as Manifest;
        if (flags['json'] === true) {
          process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
          return;
        }

        process.stdout.write(`\n${path}\n`);
        process.stdout.write(`  created   ${manifest.createdAt}\n`);
        process.stdout.write(`  source    ${manifest.source.url} (Strapi ${manifest.source.version})\n`);
        process.stdout.write(`  format    ${manifest.formatVersion}\n`);
        if (manifest.label) process.stdout.write(`  label     ${manifest.label}\n`);
        process.stdout.write(`  encrypted ${manifest.encryption ? 'yes (aes-256-gcm)' : 'no'}\n`);
        process.stdout.write(`  locales   ${manifest.contents.locales.join(', ') || '(none)'}\n`);
        process.stdout.write(`  media     ${manifest.contents.mediaFiles} files, ${formatBytes(manifest.contents.mediaBytes)}\n`);
        process.stdout.write('\n  content types\n');
        for (const entry of manifest.contents.contentTypes) {
          process.stdout.write(`     ${entry.uid.padEnd(34)} ${String(entry.recordCount).padStart(7)} records\n`);
        }
        process.stdout.write('\n');
      } finally {
        reader.close();
      }
    });
}
