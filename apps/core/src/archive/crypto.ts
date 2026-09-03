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
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import type { DecipherGCM } from 'node:crypto';
import { Transform } from 'node:stream';

export interface CipherParams {
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: Buffer;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SALT_BYTES = 16;

/**
 * scrypt with N=2^15. Deliberately slow: the passphrase is typed by a human, and
 * the archive it protects may sit in someone's Dropbox for years, so the cost of
 * a guess matters far more than the one-off cost of deriving the key here.
 */
export function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, KEY_BYTES, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function newSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

/**
 * Encrypting transform. Layout is `IV ‖ ciphertext ‖ tag`.
 *
 * A fresh IV per entry, never reused: GCM with a repeated IV under the same key
 * leaks the plaintext relationship between the two entries, and an archive has
 * many entries under one key by construction.
 */
export function encryptStream(key: Buffer): Transform {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let prefixed = false;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        if (!prefixed) {
          prefixed = true;
          this.push(iv);
        }
        this.push(cipher.update(chunk));
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        if (!prefixed) this.push(iv);
        this.push(cipher.final());
        this.push(cipher.getAuthTag());
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/**
 * Decrypting transform, the inverse layout.
 *
 * The tag arrives last but has to be set before `final()`, so the transform
 * holds back a rolling 16-byte tail and only releases it once more data proves
 * it was not the tag. That keeps decryption streaming rather than requiring the
 * whole entry in memory — which is the entire reason the archive format streams
 * in the first place.
 */
export function decryptStream(key: Buffer): Transform {
  let iv: Buffer | null = null;
  let decipher: DecipherGCM | null = null;
  let held = Buffer.alloc(0);

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        held = Buffer.concat([held, chunk]);

        if (!decipher) {
          if (held.length < IV_BYTES) {
            callback();
            return;
          }
          iv = held.subarray(0, IV_BYTES);
          held = held.subarray(IV_BYTES);
          decipher = createDecipheriv('aes-256-gcm', key, iv);
        }

        // Everything except a possible trailing tag can be decrypted now.
        if (held.length > TAG_BYTES) {
          const usable = held.subarray(0, held.length - TAG_BYTES);
          held = held.subarray(held.length - TAG_BYTES);
          this.push(decipher.update(usable));
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        if (!decipher) {
          callback(new Error('The encrypted entry ended before its header was complete.'));
          return;
        }
        if (held.length !== TAG_BYTES) {
          callback(new Error('The encrypted entry is truncated — its authentication tag is missing.'));
          return;
        }
        decipher.setAuthTag(held);
        // Throws on a bad tag, which is the point: a tampered or corrupted
        // archive must fail here rather than restore wrong records into a CMS.
        this.push(decipher.final());
        callback();
      } catch (error) {
        callback(
          new Error(
            `The archive could not be decrypted. Either the passphrase is wrong or the file has been altered. (${(error as Error).message})`,
          ),
        );
      }
    },
  });
}
