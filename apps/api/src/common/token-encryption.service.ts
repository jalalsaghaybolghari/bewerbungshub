import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Encrypts third-party OAuth tokens (Google Drive today, Gmail later per
// PLAN.md) before they're stored in Mongo — plaintext tokens at rest would
// let anyone with DB access impersonate a user to Google. AES-256-GCM
// rather than a one-way hash: unlike passwords, these tokens must be
// recovered in full to actually call Google's APIs.
@Injectable()
export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hexKey = config.get<string>('security.tokenEncryptionKey');
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  // Output packs iv + authTag + ciphertext into one colon-separated string
  // so a single column can hold everything decrypt() needs back.
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext]
      .map((buf) => buf.toString('base64'))
      .join(':');
  }

  decrypt(packed: string): string {
    const [ivB64, authTagB64, ciphertextB64] = packed.split(':');
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
