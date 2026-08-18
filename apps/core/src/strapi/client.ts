import type { Connection } from '../contracts/index.js';
import type { Session } from './auth.js';

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
  constructor(
    private readonly conn: Connection,
    private readonly session: Session,
  ) {}

  async get<T>(_path: string, _query?: Record<string, unknown>): Promise<T> {
    throw new Error('not implemented');
  }

  async post<T>(_path: string, _body: unknown): Promise<T> {
    throw new Error('not implemented');
  }

  async put<T>(_path: string, _body: unknown): Promise<T> {
    throw new Error('not implemented');
  }

  async delete(_path: string): Promise<void> {
    throw new Error('not implemented');
  }

  async stream(_path: string): Promise<ReadableStream<Uint8Array>> {
    throw new Error('not implemented');
  }
}
