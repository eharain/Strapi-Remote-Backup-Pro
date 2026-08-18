import { z } from 'zod';

/** Every destination the tool can write an archive to, or read one back from. */
export const TargetKindSchema = z.enum([
  'local', 's3', 'azureBlob', 'googleDrive', 'dropbox', 'oneDrive', 'sftp', 'ftp',
]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

/**
 * A configured destination. Secrets are referenced, not embedded: `secretRef`
 * names an entry in the credential store (DPAPI/Keychain via the desktop app, or
 * the encrypted profile file for CLI use) so that profiles stay safe to commit
 * and safe to sync between machines.
 */
export const TargetRefSchema = z.object({
  id: z.string(),
  kind: TargetKindSchema,
  name: z.string(),
  /** Kind-specific settings, validated by the provider itself on load. */
  settings: z.record(z.string(), z.unknown()).default({}),
  secretRef: z.string().optional(),
  /** How many archives to keep here before the oldest are pruned. */
  retention: z
    .object({
      keepLast: z.number().int().positive().optional(),
      keepDays: z.number().int().positive().optional(),
    })
    .optional(),
});
export type TargetRef = z.infer<typeof TargetRefSchema>;
