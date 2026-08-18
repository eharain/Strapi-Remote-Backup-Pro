/**
 * The single source of truth for every shape that crosses a process boundary.
 *
 * These zod schemas are emitted to JSON Schema by `npm run schema:emit`, and the
 * C# DTOs in apps/desktop/src/StrapiBackup.Core.Client/Generated are generated
 * from that output. Never hand-write the C# side — two hand-maintained models in
 * two languages drift within weeks.
 */
export * from './connection.js';
export * from './selection.js';
export * from './job.js';
export * from './archive.js';
export * from './target.js';
