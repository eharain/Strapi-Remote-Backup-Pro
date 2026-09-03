/**
 * Shared flag parsing and credential resolution.
 *
 * One place, because "which flag wins" is the kind of thing that quietly differs
 * between two commands and then surprises someone at 2am during a restore.
 * Order is: explicit flag, then environment, then an interactive prompt.
 */
import { createInterface } from 'node:readline';
import { ConnectionSchema } from '../contracts/index.js';
import type { Connection, Selection } from '../contracts/index.js';

export interface ConnectionFlags {
  url?: string;
  email?: string;
  password?: string;
  token?: string;
  insecure?: boolean;
  concurrency?: string;
  timeout?: string;
}

export async function resolveConnection(flags: ConnectionFlags): Promise<Connection> {
  const url = flags.url ?? process.env['STRAPI_URL'];
  if (!url) {
    throw new UserError('No Strapi URL given. Pass --url https://cms.example.com or set STRAPI_URL.');
  }

  const token = flags.token ?? process.env['STRAPI_TOKEN'];
  const credentials = token
    ? { kind: 'apiToken' as const, token }
    : {
        kind: 'admin' as const,
        email: flags.email ?? process.env['STRAPI_EMAIL'] ?? '',
        // Prompted rather than required on the command line: a password in argv
        // is visible to every other process on the machine and lands in shell
        // history.
        password: flags.password ?? process.env['STRAPI_PASSWORD'] ?? (await promptHidden('Admin password: ')),
      };

  if (credentials.kind === 'admin' && !credentials.email) {
    throw new UserError('No admin email given. Pass --email you@example.com or set STRAPI_EMAIL.');
  }

  try {
    return ConnectionSchema.parse({
      url,
      credentials,
      insecureTls: flags.insecure === true,
      ...(flags.concurrency ? { concurrency: Number(flags.concurrency) } : {}),
      ...(flags.timeout ? { requestTimeoutMs: Number(flags.timeout) } : {}),
    });
  } catch {
    throw new UserError(`"${url}" is not a valid URL, or the connection options are out of range.`);
  }
}

export interface SelectionFlags {
  types?: string;
  ids?: string;
  depth?: string;
  media?: boolean;
  schemas?: boolean;
  drafts?: boolean;
  locales?: string;
  since?: string;
}

export function resolveSelection(flags: SelectionFlags): Selection {
  const documentIds: Record<string, string[]> = {};
  for (const pair of splitList(flags.ids)) {
    const [uid, id] = pair.split('=');
    if (!uid || !id) throw new UserError(`--ids expects uid=documentId pairs, got "${pair}".`);
    const bucket = documentIds[uid];
    if (bucket) bucket.push(id);
    else documentIds[uid] = [id];
  }

  return {
    contentTypes: splitList(flags.types),
    documentIds,
    depth: flags.depth === undefined ? 1 : Number(flags.depth),
    followUnselectedTypes: true,
    includeMedia: flags.media !== false,
    includeSchemas: flags.schemas !== false,
    includeDrafts: flags.drafts !== false,
    locales: splitList(flags.locales),
    ...(flags.since ? { modifiedSince: new Date(flags.since).toISOString() } : {}),
  };
}

export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * A problem with what the user asked for, as opposed to a crash.
 *
 * Printed as one line without a stack trace: a stack for "you forgot --url"
 * teaches people that this tool's errors are not worth reading.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new UserError(
      'No password given and nothing to prompt on. Pass --password, set STRAPI_PASSWORD, or use --token.',
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const output = process.stdout;
  // Suppress the echo of what is typed. readline offers no hidden-input mode, so
  // the write hook is the standard way of doing this.
  const originalWrite = output.write.bind(output);
  let muted = false;
  (output as unknown as { write: (chunk: string) => boolean }).write = (chunk: string): boolean => {
    if (muted) return true;
    return originalWrite(chunk);
  };

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(question, (value) => resolve(value));
      muted = true;
    });
    muted = false;
    originalWrite('\n');
    return answer;
  } finally {
    muted = false;
    (output as unknown as { write: typeof originalWrite }).write = originalWrite;
    rl.close();
  }
}
