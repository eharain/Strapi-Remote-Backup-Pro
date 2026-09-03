#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Every command is a thin wrapper over the same engine calls the local API
 * exposes — the command line is a first-class way to use this tool, not a
 * debugging shortcut, so an expert never needs the GUI to do anything.
 */
import { Command } from 'commander';
import { PRODUCT, TRADEMARK_NOTICE } from '../branding.js';
import { UserError } from './options.js';
import { registerBackup } from './commands/backup.js';
import { registerRestore } from './commands/restore.js';
import { registerInspect } from './commands/inspect.js';
import { registerVerify } from './commands/verify.js';
import { registerLogin } from './commands/login.js';

const program = new Command()
  .name('strapi-backup')
  .description('Back up and restore a Strapi instance remotely — no plugin required')
  .version(PRODUCT.version)
  .addHelpText(
    'after',
    `\nExamples:\n` +
      `  strapi-backup login --url https://cms.example.com --email you@example.com\n` +
      `  strapi-backup backup --url https://cms.example.com --email you@example.com --out ./backups\n` +
      `  strapi-backup inspect ./backups/strapi-backup-cms-2026-08-27.zip\n` +
      `  strapi-backup restore ./backups/strapi-backup-cms-2026-08-27.zip --url https://staging.example.com --dry-run\n` +
      `\n${TRADEMARK_NOTICE}\n`,
  );

// Commands are registered from ./commands — see each file for its flags.
registerLogin(program);
registerBackup(program);
registerRestore(program);
registerInspect(program);
registerVerify(program);

/**
 * One place where anything thrown becomes something a person can act on.
 *
 * A UserError is a mistake in what was asked for and gets one line. Anything
 * else is ours, and gets the stack — hiding it would only make the report we
 * eventually receive useless.
 */
program.exitOverride((error) => {
  throw error;
});

export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof UserError) {
      process.stderr.write(`\n${error.message}\n\n`);
      process.exitCode = 1;
      return;
    }
    // Commander throws for --help and --version too; those are not failures.
    const code = (error as { code?: string }).code;
    if (code === 'commander.helpDisplayed' || code === 'commander.version' || code === 'commander.help') return;
    if (code === 'commander.unknownCommand' || code === 'commander.missingArgument' || code === 'commander.excessArguments') {
      process.stderr.write(`\n${(error as Error).message}\n\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

export { program };
