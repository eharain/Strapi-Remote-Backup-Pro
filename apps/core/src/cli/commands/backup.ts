/**
 * `strapi-backup backup --profile prod --out ./backups`
 *
 * Key flags:
 *   --types <uid,...>      restrict to specific content types
 *   --depth <n>            relation hops to follow beyond the selection
 *   --no-media             skip the media library
 *   --since <iso>          only records changed since — incremental runs
 *   --target <id>          deliver to a configured destination, repeatable
 *   --encrypt              prompt for a passphrase and encrypt at rest
 */
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { BackupRequestSchema } from '../../contracts/index.js';
import type { JobEvent } from '../../contracts/index.js';
import { runBackup } from '../../backup/runner.js';
import { UserError, resolveConnection, resolveSelection } from '../options.js';
import { renderEvent, renderReport } from '../render.js';

export function registerBackup(program: Command): void {
  program
    .command('backup')
    .description('Back up a Strapi instance to a local folder or a configured destination')
    .option('--url <url>', 'Strapi base URL (or set STRAPI_URL)')
    .option('--email <email>', 'admin email (or set STRAPI_EMAIL)')
    .option('--password <password>', 'admin password — prefer STRAPI_PASSWORD or the prompt')
    .option('--token <token>', 'API token instead of admin credentials (or set STRAPI_TOKEN)')
    .option('--out <dir>', 'folder to write the archive into', './backups')
    .option('--types <uid,...>', 'restrict to specific content types')
    .option('--ids <uid=documentId,...>', 'restrict to specific documents')
    .option('--depth <n>', 'relation hops to follow beyond the selection', '1')
    .option('--no-media', 'skip the media library')
    .option('--no-schemas', 'skip the content-type definitions')
    .option('--no-drafts', 'published versions only')
    .option('--locales <code,...>', 'restrict to specific locales')
    .option('--since <iso>', 'only records changed since this instant')
    .option('--label <text>', 'label recorded in the archive and its filename')
    .option('--encrypt <passphrase>', 'encrypt the archive at rest')
    .option('--insecure', 'skip TLS verification — development only')
    .option('--concurrency <n>', 'concurrent requests against Strapi')
    .option('--timeout <ms>', 'per-request timeout')
    .option('--json', 'emit the run report as JSON instead of prose')
    .action(async (flags: Record<string, string | boolean | undefined>) => {
      const connection = await resolveConnection(flags);
      const selection = resolveSelection(flags);
      const directory = resolve(String(flags['out'] ?? './backups'));

      const passphrase = flags['encrypt'];
      if (passphrase !== undefined && (typeof passphrase !== 'string' || passphrase.length < 8)) {
        throw new UserError('--encrypt needs a passphrase of at least 8 characters.');
      }

      const request = BackupRequestSchema.parse({
        connection,
        selection,
        targets: [
          { id: 'cli-out', kind: 'local', name: directory, settings: { directory } },
        ],
        ...(typeof passphrase === 'string' ? { encryptionPassphrase: passphrase } : {}),
        ...(typeof flags['label'] === 'string' ? { label: flags['label'] } : {}),
      });

      const asJson = flags['json'] === true;
      const emit = (event: JobEvent): void => {
        if (!asJson) renderEvent(event);
      };

      const report = await runBackup(request, emit);
      if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else renderReport(report, directory);

      // A failed run must not exit 0. Cron and CI read the exit code, and a
      // backup that silently reports success is the failure this tool exists to
      // prevent.
      if (report.state !== 'succeeded') process.exitCode = 1;
    });
}
