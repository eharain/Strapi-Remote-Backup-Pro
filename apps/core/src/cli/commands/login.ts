/** `strapi-backup login` — can this tool reach and authenticate to an instance? */
import type { Command } from 'commander';
import { openDialect } from '../../strapi/probe.js';
import { discoverModel } from '../../schema/discovery.js';
import { resolveConnection } from '../options.js';

export function registerLogin(program: Command): void {
  program
    .command('login')
    .description('Check credentials and report what this tool can see')
    .option('--url <url>', 'Strapi base URL (or set STRAPI_URL)')
    .option('--email <email>', 'admin email (or set STRAPI_EMAIL)')
    .option('--password <password>', 'admin password — prefer STRAPI_PASSWORD or the prompt')
    .option('--token <token>', 'API token instead of admin credentials')
    .option('--insecure', 'skip TLS verification — development only')
    .action(async (flags: Record<string, string | boolean | undefined>) => {
      const connection = await resolveConnection(flags);
      const handle = await openDialect(connection);
      try {
        const probe = await handle.dialect.probe();
        const model = await discoverModel(handle.dialect);
        const own = [...model.contentTypes.keys()].filter((uid) => uid.startsWith('api::'));

        process.stdout.write(`\n${connection.url}\n`);
        process.stdout.write(`  Strapi        ${handle.version}${probe.versionString ? ` (${probe.versionString})` : ''}\n`);
        process.stdout.write(`  authenticated ${probe.authenticated ? 'yes' : 'no'}\n`);
        process.stdout.write(`  schemas       ${probe.canReadSchemas ? 'readable' : 'NOT readable'}\n`);
        process.stdout.write(`  content types ${own.length} of your own, ${model.contentTypes.size} in total\n`);
        process.stdout.write(`  locales       ${model.locales.join(', ') || '(none)'}\n`);
        for (const warning of probe.warnings) process.stdout.write(`\n  ! ${warning}\n`);
        process.stdout.write('\n');
      } finally {
        await handle.dispose();
      }
    });
}
