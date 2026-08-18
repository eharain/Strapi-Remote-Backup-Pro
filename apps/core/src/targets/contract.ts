import type { TargetKind, TargetRef } from '../contracts/index.js';

export interface StoredArchive {
  key: string;
  name: string;
  size: number;
  createdAt: Date;
}

/**
 * A place archives live. Local disk and seven remote services all sit behind
 * this, so the backup runner never knows where its output is going and adding a
 * destination touches nothing outside this folder.
 *
 * Everything is stream-based on purpose. A target that took a Buffer would cap
 * archive size at whatever fits in memory, which is precisely the constraint
 * this tool cannot afford.
 */
export interface BackupTarget {
  readonly kind: TargetKind;
  readonly id: string;

  /** Check credentials and reachability before a long backup starts writing. */
  test(): Promise<{ ok: boolean; message?: string }>;

  put(key: string, body: ReadableStream<Uint8Array>, size?: number): Promise<StoredArchive>;
  get(key: string): Promise<ReadableStream<Uint8Array>>;
  list(prefix?: string): Promise<StoredArchive[]>;
  remove(key: string): Promise<void>;
}

export interface TargetProvider {
  readonly kind: TargetKind;
  /** Validate `ref.settings` and resolve `ref.secretRef` into a live client. */
  create(ref: TargetRef, secret: unknown): Promise<BackupTarget>;
}
