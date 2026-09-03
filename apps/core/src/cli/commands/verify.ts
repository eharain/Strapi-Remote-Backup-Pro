/** `strapi-backup verify <archive>` — is this archive still intact? */
import { isAbsolute, resolve } from 'node:path';
import type { Command } from 'commander';
import { ArchiveReader } from '../../archive/zip-reader.js';

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .argument('<archive>', 'path to the .zip archive')
    .description('Check an archive against the checksums recorded inside it')
    .action(async (archive: string) => {
      const path = isAbsolute(archive) ? archive : resolve(archive);
      // No passphrase needed: checksums are taken over the stored bytes, so an
      // encrypted archive can be checked for damage without being unlocked.
      const reader = await ArchiveReader.open({ path });
      try {
        const result = await reader.verify();
        if (result.ok) {
          process.stdout.write(`${path}\n  intact — every entry matches its checksum\n`);
          return;
        }
        process.stdout.write(`${path}\n  DAMAGED — these entries do not match their checksums:\n`);
        for (const entry of result.corrupted) process.stdout.write(`     ${entry}\n`);
        process.exitCode = 1;
      } finally {
        reader.close();
      }
    });
}
