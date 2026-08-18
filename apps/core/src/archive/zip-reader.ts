/**
 * Streaming zip reader.
 *
 * The manifest is always readable without a passphrase, even for encrypted
 * archives, so a UI can list what an archive holds before asking the user to
 * unlock it. Content entries are yielded record by record rather than parsed
 * whole, mirroring the writer.
 */
export class ArchiveReader {
  async readManifest(): Promise<unknown> {
    throw new Error('not implemented');
  }

  async *records(_uid: string): AsyncIterable<unknown> {
    throw new Error('not implemented');
  }

  async openMedia(_hash: string): Promise<ReadableStream<Uint8Array>> {
    throw new Error('not implemented');
  }

  /** Verify every entry against the checksums in the manifest. */
  async verify(): Promise<{ ok: boolean; corrupted: string[] }> {
    throw new Error('not implemented');
  }
}
