import { fetch } from 'undici';
import type { FormData } from 'undici';
import type { Agent, Response } from 'undici';
import type { Connection } from '../contracts/index.js';
import type { Session } from './auth.js';
import { isExpired, refresh } from './auth.js';
import {
  DEFAULT_RETRY,
  StrapiHttpError,
  StrapiNetworkError,
  buildQuery,
  createAgent,
  joinUrl,
  retryDelayMs,
  sleep,
} from './http.js';
import type { RetryPolicy } from './http.js';

/**
 * A counting semaphore that hands back an explicit release.
 *
 * `p-limit` wraps a whole function call, which is the wrong shape for media
 * downloads: the request resolves as soon as the headers arrive, but the slot
 * has to stay held until the body has finished streaming, or the concurrency cap
 * only limits how many downloads *start* at once rather than how many run.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
      this.active += 1;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) next();
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

interface SendOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Multipart bodies are passed through untouched rather than JSON-encoded. */
  form?: FormData;
}

/**
 * The HTTP transport every dialect sits on: retries, backoff, concurrency
 * limiting, and JWT refresh.
 *
 * Deliberately conservative. This tool points at live production CMS instances
 * that belong to someone else, so a backup must never be the reason a site goes
 * down: requests are capped by `connection.concurrency`, 429 and 503 are honoured
 * with backoff rather than hammered, and there is no unbounded retry loop.
 */
export class StrapiHttpClient {
  private readonly conn: Connection;
  private session: Session;
  private readonly agent: Agent;
  private readonly gate: Semaphore;
  private readonly retry: RetryPolicy;
  /** One in-flight renewal, shared. Four concurrent requests that all see a 401
   *  must not each call POST /admin/login — that is five attempts against a
   *  five-attempt rate limit, and it locks the user out of their own CMS. */
  private renewing: Promise<Session> | null = null;

  constructor(conn: Connection, session: Session, retry: RetryPolicy = DEFAULT_RETRY) {
    this.conn = conn;
    this.session = session;
    this.agent = createAgent(conn);
    this.gate = new Semaphore(conn.concurrency);
    this.retry = retry;
  }

  /** The current session, which may have been renewed since construction. */
  get currentSession(): Session {
    return this.session;
  }

  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.json<T>('GET', path, query ? { query } : {});
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>('POST', path, { body });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>('PUT', path, { body });
  }

  async delete(path: string): Promise<void> {
    await this.gate.run(async () => {
      const response = await this.send('DELETE', path, {});
      await response.body?.cancel();
    });
  }

  /** Multipart upload — the only shape Strapi's /upload endpoint accepts. */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    return this.gate.run(async () => {
      const response = await this.send('POST', path, { form });
      return (await response.json()) as T;
    });
  }

  /**
   * Stream a response body — media downloads, and nothing else so far.
   *
   * The concurrency slot is held until the body is fully read or cancelled, not
   * merely until the headers arrive, so a media library download honours the
   * same cap as everything else.
   */
  async stream(path: string): Promise<ReadableStream<Uint8Array>> {
    const release = await this.gate.acquire();
    let response: Response;
    try {
      response = await this.send('GET', path, {});
    } catch (error) {
      release();
      throw error;
    }

    const body = response.body;
    if (!body) {
      release();
      throw new StrapiHttpError(response.status, response.statusText, path, 'The response had no body to stream.');
    }

    return body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
        flush() {
          release();
        },
        cancel() {
          release();
        },
      }),
    );
  }

  /** Release the connection pool. Safe to call more than once. */
  async dispose(): Promise<void> {
    await this.agent.close();
  }

  private async json<T>(method: string, path: string, options: SendOptions): Promise<T> {
    return this.gate.run(async () => {
      const response = await this.send(method, path, options);
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    });
  }

  /**
   * One request, with the whole retry policy around it.
   *
   * A 401 triggers exactly one renewal and does not consume a retry attempt —
   * a token expiring part way through an hour-long backup is expected, not a
   * failure. Everything else follows `retryable`: 429 and 5xx back off, and a
   * 400 or 403 is returned to the caller immediately because repeating it would
   * only add load to an instance that has already refused.
   */
  private async send(method: string, path: string, options: SendOptions): Promise<Response> {
    const url = joinUrl(this.conn.url, path) + buildQuery(options.query);
    let attempt = 0;
    let renewed = false;

    for (;;) {
      await this.ensureFreshSession();

      const headers: Record<string, string> = {
        authorization: `Bearer ${this.session.token}`,
        accept: 'application/json',
        ...options.headers,
      };
      let payload: string | FormData | undefined;
      if (options.form) {
        payload = options.form;
      } else if (options.body !== undefined) {
        payload = JSON.stringify(options.body);
        headers['content-type'] = 'application/json';
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          ...(payload === undefined ? {} : { body: payload }),
          dispatcher: this.agent,
          signal: options.signal ?? AbortSignal.timeout(this.conn.requestTimeoutMs),
        });
      } catch (error) {
        if (attempt < this.retry.attempts - 1) {
          attempt += 1;
          await sleep(retryDelayMs(attempt, null, this.retry), options.signal);
          continue;
        }
        throw new StrapiNetworkError(url, error);
      }

      if (response.ok) return response;

      if (response.status === 401 && !renewed && this.session.kind === 'admin') {
        renewed = true;
        await response.body?.cancel();
        await this.renewSession();
        continue;
      }

      const body = await response.text().catch(() => '');
      const error = new StrapiHttpError(response.status, response.statusText, url, body);
      if (error.retryable && attempt < this.retry.attempts - 1) {
        attempt += 1;
        await sleep(retryDelayMs(attempt, response.headers.get('retry-after'), this.retry), options.signal);
        continue;
      }
      throw error;
    }
  }

  private async ensureFreshSession(): Promise<void> {
    if (this.session.kind !== 'admin') return;
    if (!isExpired(this.session)) return;
    await this.renewSession();
  }

  private async renewSession(): Promise<void> {
    this.renewing ??= refresh(this.session, this.conn).finally(() => {
      this.renewing = null;
    });
    this.session = await this.renewing;
  }
}
