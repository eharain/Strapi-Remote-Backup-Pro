/**
 * zod → JSON Schema. The first half of the contract pipeline in
 * [ADR 0008](../../docs/adr/0008-generated-contracts.md).
 *
 * Output is committed to `docs/api/schema` so a contract change shows up in
 * review as a diff rather than as a runtime mismatch between two languages
 * weeks later. CI regenerates and fails if the committed files differ.
 *
 * Run from `apps/core`: `npm run schema:emit`.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import * as contracts from '../../apps/core/src/contracts/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../../docs/api/schema');

/**
 * Every exported zod schema, by the name it will carry into C#.
 *
 * Discovered rather than listed: a hand-maintained list is a list that silently
 * stops covering a new contract, which is exactly the drift this pipeline exists
 * to prevent.
 */
function exportedSchemas(): Array<{ name: string; schema: ZodTypeAny }> {
  const found: Array<{ name: string; schema: ZodTypeAny }> = [];
  for (const [exportName, value] of Object.entries(contracts)) {
    if (!exportName.endsWith('Schema')) continue;
    if (!isZodSchema(value)) continue;
    found.push({ name: exportName.replace(/Schema$/, ''), schema: value });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    typeof (value as { safeParse?: unknown }).safeParse === 'function'
  );
}

async function main(): Promise<void> {
  const schemas = exportedSchemas();
  if (schemas.length === 0) {
    throw new Error('No exported zod schemas were found in apps/core/src/contracts.');
  }

  await mkdir(outputDir, { recursive: true });

  // Anything previously generated is removed first. Leaving a stale file behind
  // when a contract is deleted means the C# side keeps a type nothing produces.
  for (const existing of await readdir(outputDir).catch(() => [])) {
    if (existing.endsWith('.json')) await rm(join(outputDir, existing));
  }

  for (const { name, schema } of schemas) {
    const json = zodToJsonSchema(schema, {
      name,
      // Inlined rather than $ref'd into a shared definitions block: each file is
      // meant to be readable on its own in a pull request.
      $refStrategy: 'none',
      target: 'jsonSchema7',
    });
    // Two-space indent and a trailing newline, so `git diff --exit-code` in CI
    // compares content rather than formatting.
    await writeFile(join(outputDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`Wrote ${schemas.length} schemas to docs/api/schema\n`);
  for (const { name } of schemas) process.stdout.write(`  ${name}.json\n`);
}

// Not top-level await: this script is run through tsx, which transforms it to
// CommonJS, and a top-level await there fails with ERR_REQUIRE_ASYNC_MODULE.
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
