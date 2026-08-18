#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Every command is a thin wrapper over the same engine calls the local API
 * exposes — the command line is a first-class way to use this tool, not a
 * debugging shortcut, so an expert never needs the GUI to do anything.
 */
import { Command } from 'commander';

const program = new Command()
  .name('strapi-backup')
  .description('Back up and restore a Strapi instance remotely — no plugin required')
  .version('0.1.0');

// Commands are registered from ./commands — see each file for its flags.
export { program };
