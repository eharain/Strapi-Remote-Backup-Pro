import { z } from 'zod';
import { ConnectionSchema } from './connection.js';
import { SelectionSchema, RestoreOptionsSchema } from './selection.js';
import { TargetRefSchema } from './target.js';

export const JobKindSchema = z.enum(['backup', 'restore', 'verify']);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStateSchema = z.enum([
  'queued', 'running', 'succeeded', 'failed', 'cancelled',
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const BackupRequestSchema = z.object({
  connection: ConnectionSchema,
  selection: SelectionSchema,
  /** Where the finished archive is delivered. More than one is allowed — the
   *  archive is built once and fanned out. */
  targets: z.array(TargetRefSchema).min(1),
  /** Passphrase for at-rest encryption. Absent means an unencrypted archive. */
  encryptionPassphrase: z.string().min(8).optional(),
  label: z.string().optional(),
});
export type BackupRequest = z.infer<typeof BackupRequestSchema>;

export const RestoreRequestSchema = z.object({
  connection: ConnectionSchema,
  /** Where the archive is read from. */
  source: TargetRefSchema,
  archivePath: z.string(),
  options: RestoreOptionsSchema,
  decryptionPassphrase: z.string().optional(),
});
export type RestoreRequest = z.infer<typeof RestoreRequestSchema>;

/**
 * Progress events streamed to any UI over SSE. The desktop app renders these;
 * the CLI prints them. One event vocabulary, two presentations.
 */
export const JobEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('phase'), phase: z.string(), detail: z.string().optional() }),
  z.object({
    type: z.literal('progress'),
    unit: z.enum(['records', 'files', 'bytes']),
    current: z.number(),
    total: z.number().optional(),
    contentType: z.string().optional(),
  }),
  z.object({ type: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string() }),
  z.object({ type: z.literal('warning'), message: z.string(), contentType: z.string().optional() }),
  z.object({ type: z.literal('done'), state: JobStateSchema, summary: z.unknown() }),
]);
export type JobEvent = z.infer<typeof JobEventSchema>;

export const JobSchema = z.object({
  id: z.string(),
  kind: JobKindSchema,
  state: JobStateSchema,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

/** What a finished run reports back — also written into the archive itself. */
export const RunReportSchema = z.object({
  jobId: z.string(),
  kind: JobKindSchema,
  state: JobStateSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number(),
  recordsByType: z.record(z.string(), z.number()).default({}),
  mediaFiles: z.number().default(0),
  bytesWritten: z.number().default(0),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});
export type RunReport = z.infer<typeof RunReportSchema>;
