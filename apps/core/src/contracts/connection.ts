import { z } from 'zod';

/** Which admin-API dialect an instance speaks. Detected, never assumed. */
export const StrapiVersionSchema = z.enum(['v4', 'v5']);
export type StrapiVersion = z.infer<typeof StrapiVersionSchema>;

/**
 * How we authenticate against the target instance.
 *
 * `admin` is the primary path — email + password against POST /admin/login — and
 * is the only one that reaches the Content-Type Builder, so it is required for a
 * schema-complete backup. `apiToken` covers instances whose admin login is behind
 * SSO or 2FA, at the cost of a narrower view of the data.
 */
export const CredentialsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('admin'),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  z.object({
    kind: z.literal('apiToken'),
    token: z.string().min(1),
  }),
]);
export type Credentials = z.infer<typeof CredentialsSchema>;

export const ConnectionSchema = z.object({
  /** Base URL of the Strapi instance, e.g. https://cms.example.com */
  url: z.string().url(),
  credentials: CredentialsSchema,
  /** Skip TLS verification. Development only — never persisted to a profile. */
  insecureTls: z.boolean().default(false),
  requestTimeoutMs: z.number().int().positive().default(60_000),
  /** Concurrent in-flight requests against Strapi. Kept low by default: the
   *  admin API is not rate-limited generously and this is someone's live CMS. */
  concurrency: z.number().int().min(1).max(32).default(4),
});
export type Connection = z.infer<typeof ConnectionSchema>;

/** Result of probing an instance before any real work begins. */
export const ProbeResultSchema = z.object({
  reachable: z.boolean(),
  version: StrapiVersionSchema.optional(),
  /** Reported Strapi version string, when the instance discloses one. */
  versionString: z.string().optional(),
  authenticated: z.boolean(),
  /** True when the credentials can read the Content-Type Builder. Without it,
   *  schemas cannot be captured and restore fidelity drops. */
  canReadSchemas: z.boolean(),
  warnings: z.array(z.string()).default([]),
});
export type ProbeResult = z.infer<typeof ProbeResultSchema>;
