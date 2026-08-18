/**
 * Streaming zip writer.
 *
 * Entries are appended as their data arrives, so peak memory stays flat
 * regardless of archive size. Zip64 is enabled unconditionally — media libraries
 * cross the 4 GB boundary far more often than people expect, and discovering the
 * limit at the end of a long backup is the worst possible time.
 *
 * SHA-256 is computed inline while writing, so the manifest can record a checksum
 * per entry without a second pass over the finished file.
 */
export class ArchiveWriter {
  async addJson(_path: string, _value: unknown): Promise<void> {
    throw new Error('not implemented');
  }

  /** Append one NDJSON line to an open content entry. */
  async addRecord(_uid: string, _record: unknown): Promise<void> {
    throw new Error('not implemented');
  }

  async addStream(_path: string, _body: ReadableStream<Uint8Array>): Promise<void> {
    throw new Error('not implemented');
  }

  async finalise(): Promise<{ path: string; bytes: number }> {
    throw new Error('not implemented');
  }
}
