/**
 * The bottom of the HTTP stack: one dispatcher per connection, one error type,
 * and the retry policy both the authenticator and the client obey.
 *
 * Split out from client.ts because authentication has to make an HTTP call
 * before a session exists, and client.ts needs to re-authenticate when a token
 * expires mid-run. Putting the shared pieces here keeps that from becoming a
 * circular import between the two.
 */
import { Agent } from 'undici';
import type { Connection } from '../contracts/index.js';

/**
 * A non-2xx response. Carries the status so callers can distinguish "your
 * credentials are wrong" from "the server is briefly unhappy" — the first must
 * never be retried, and the second always should be.
 */
export class StrapiHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(status: number, statusText: string, url: string, body: string) {
    const detail = body ? `: ${body.slice(0, 500)}` : '';
    super(`Strapi returned ${status} ${statusText} for ${url}${detail}`);
    this.name = 'StrapiHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }

  /**
   * 429 and 5xx are the instance asking for a moment, not a refusal. Everything
   * else — 400, 401, 403, 404, 422 — means the request itself was wrong, and
   * repeating it just adds load to a CMS that already said no.
   */
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || (this.status >= 500 && this.status <= 599);
  }
}

/** Raised when the instance is unreachable rather than unhappy. */
export class StrapiNetworkError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Could not reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'StrapiNetworkError';
    this.cause = cause;
  }
}

/**
 * `insecureTls` exists for self-signed certificates on development instances and
 * is never persisted into a profile. It is opt-in per connection rather than a
 * process-wide NODE_TLS_REJECT_UNAUTHORIZED, which would silently disable
 * verification for every other target in the same run.
 */
export function createAgent(conn: Connection): Agent {
  return new Agent({
    connect: conn.insecureTls ? { rejectUnauthorized: false } : {},
    headersTimeout: conn.requestTimeoutMs,
    bodyTimeout: conn.requestTimeoutMs,
  });
}

export function joinUrl(base: string, path: string): string {
  const left = base.endsWith('/') ? base.slice(0, -1) : base;
  const right = path.startsWith('/') ? path : `/${path}`;
  return `${left}${right}`;
}

export function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  const append = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        append(`${key}[${index}]`, item);
      });
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        append(`${key}[${childKey}]`, childValue);
      }
      return;
    }
    params.append(key, String(value));
  };

  for (const [key, value] of Object.entries(query)) append(key, value);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 5, baseDelayMs: 500, maxDelayMs: 30_000 };

/**
 * How long to wait before attempt N.
 *
 * `Retry-After` wins when the instance sends one, because a server that has told
 * us its rate-limit window is the only party that actually knows. Otherwise
 * exponential backoff with jitter — without jitter, a backup running 4 requests
 * concurrently retries all 4 at the same instant and reproduces the burst that
 * caused the 429 in the first place.
 */
export function retryDelayMs(attempt: number, retryAfter: string | null, policy: RetryPolicy): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, policy.maxDelayMs);
    }
    const when = Date.parse(retryAfter);
    if (Number.isFinite(when)) {
      return Math.min(Math.max(when - Date.now(), 0), policy.maxDelayMs);
    }
  }
  const exponential = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
