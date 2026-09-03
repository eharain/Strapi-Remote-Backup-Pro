#!/usr/bin/env node
import { run } from '../dist/cli/index.js';

run().catch((error) => {
  process.stderr.write(`\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n\n`);
  process.exitCode = 1;
});
