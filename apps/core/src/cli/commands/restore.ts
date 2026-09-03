/**
 * `strapi-backup restore <archive> --profile staging`
 *
 * Defaults to `--dry-run` semantics in spirit: the plan is always printed and
 * confirmation is required before anything is written, unless `--yes` is passed.
 * This command writes to a live CMS, and the cost of an accidental run is the
 * reason the confirmation is not optional by default.
 *
 * Key flags:
 *   --types <uid,...>      restore only these content types
 *   --ids <uid=id,...>     restore only these documents
 *   --depth <n>            pull in related records the selection depends on
 *   --strategy <s>         create | upsert | skip | replace
 *   --dry-run              print the plan and exit
 *   --yes                  skip confirmation, for CI
 */
import { createInterface } from 'node:readline/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { Command } from 'commander';
import { RestoreRequestSchema } from '../../contracts/index.js';
import type { JobEvent } from '../../contracts/index.js';
import { runRestore } from '../../restore/runner.js';
import { UserError, resolveConnection, resolveSelection } from '../options.js';
import { renderEvent, renderReport } from '../render.js';

const STRATEGIES = new Set(['create', 'upsert', 'skip', 'replace']);

export function registerRestore(program: Command): void {
  program
    .command('restore')
    .argument('<archive>', 'path to the .zip archive')
    .description('Restore an archive into a Strapi instance')
    .option('--url <url>', 'Strapi base URL (or set STRAPI_URL)')
    .option('--email <email>', 'admin email (or set STRAPI_EMAIL)')
    .option('--password <password>', 'admin password — prefer STRAPI_PASSWORD or the prompt')
    .option('--token <token>', 'API token instead of admin credentials (or set STRAPI_TOKEN)')
    .option('--types <uid,...>', 'restore only these content types')
    .option('--ids <uid=documentId,...>', 'restore only these documents')
    .option('--depth <n>', 'relation hops to pull in', '1')
    .option('--strategy <s>', 'create | upsert | skip | replace', 'upsert')
    .option('--dry-run', 'print the plan and change nothing')
    .option('--yes', 'skip the confirmation prompt')
    .option('--no-media', 'do not upload the archived media')
    .option('--no-publish', 'restore everything as a draft')
    .option('--stop-on-error', 'abort on the first failure')
    .option('--decrypt <passphrase>', 'passphrase for an encrypted archive')
    .option('--insecure', 'skip TLS verification — development only')
    .option('--json', 'emit the run report as JSON instead of prose')
    .action(async (archive: string, flags: Record<string, string | boolean | undefined>) => {
      const strategy = String(flags['strategy'] ?? 'upsert');
      if (!STRATEGIES.has(strategy)) {
        throw new UserError(`--strategy must be one of ${[...STRATEGIES].join(', ')}, not "${strategy}".`);
      }

      const connection = await resolveConnection(flags);
      const selection = resolveSelection(flags);
      const full = isAbsolute(archive) ? archive : resolve(archive);
      const dryRun = flags['dryRun'] === true;

      const request = RestoreRequestSchema.parse({
        connection,
        source: {
          id: 'cli-in',
          kind: 'local',
          name: dirname(full),
          settings: { directory: dirname(full) },
        },
        archivePath: full,
        options: {
          selection,
          strategy,
          dryRun,
          restoreMedia: flags['media'] !== false,
          preservePublishState: flags['publish'] !== false,
          stopOnError: flags['stopOnError'] === true,
        },
        ...(typeof flags['decrypt'] === 'string' ? { decryptionPassphrase: flags['decrypt'] } : {}),
      });

      // The confirmation is the whole safety story for this command, so it is
      // asked before the plan runs rather than after: by the time a plan has been
      // computed the connection is open and the next step writes.
      if (!dryRun && flags['yes'] !== true) {
        if (!process.stdin.isTTY) {
          throw new UserError(
            'Restoring writes to a live Strapi instance. Re-run with --yes to confirm, or --dry-run to see the plan first.',
          );
        }
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = await rl.question(
            `\nThis will write to ${connection.url} using the "${strategy}" strategy.\nType yes to continue: `,
          );
          if (answer.trim().toLowerCase() !== 'yes') {
            process.stdout.write('Nothing was written.\n');
            return;
          }
        } finally {
          rl.close();
        }
      }

      const asJson = flags['json'] === true;
      const emit = (event: JobEvent): void => {
        if (!asJson) renderEvent(event);
      };

      const report = await runRestore(request, emit);
      if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else renderReport(report);
      if (report.state !== 'succeeded') process.exitCode = 1;
    });
}
