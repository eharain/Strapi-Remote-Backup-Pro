/**
 * Optional at-rest encryption, AES-256-GCM with a scrypt-derived key.
 *
 * Worth having by default in spirit: an archive can contain an entire customer
 * database and, if the user opted into backing up settings, admin accounts too.
 * It then gets uploaded to Dropbox.
 *
 * The manifest stays in the clear so archives remain listable; everything else is
 * encrypted per entry, which keeps random access and streaming intact. GCM tags
 * are verified on read, so a truncated or tampered archive fails loudly rather
 * than restoring corrupted records into a live CMS.
 */
export interface CipherParams {
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: Buffer;
}

export function deriveKey(_passphrase: string, _salt: Buffer): Promise<Buffer> {
  throw new Error('not implemented');
}
