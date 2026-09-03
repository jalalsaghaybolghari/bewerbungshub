import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

// 64 hex chars = 32 bytes, dev-only — never a real secret. Computed rather
// than hand-typed so its length is correct by construction.
const TEST_KEY = '0123456789abcdef'.repeat(4).slice(0, 64);

// No default parameter here deliberately — makeService(undefined) must
// actually pass `undefined` through to exercise the "missing key" branch,
// which a default parameter would silently swallow (JS applies a default
// specifically when the argument is `undefined`).
function makeService(key: string | undefined): TokenEncryptionService {
  const config = {
    get: (path: string) =>
      path === 'security.tokenEncryptionKey' ? key : undefined,
  } as ConfigService;
  return new TokenEncryptionService(config);
}

describe('TokenEncryptionService', () => {
  it('decrypts back to the original plaintext (happy path)', () => {
    const service = makeService(TEST_KEY);
    const encrypted = service.encrypt('super-secret-refresh-token');
    expect(service.decrypt(encrypted)).toBe('super-secret-refresh-token');
  });

  it('produces different ciphertext for the same plaintext on repeated calls (edge case)', () => {
    // A fresh random IV per call means the output must differ even for
    // identical input — otherwise two users' identical tokens would be
    // distinguishable from ciphertext alone, and repeated encryption of
    // the same value would leak that it repeated.
    const service = makeService(TEST_KEY);
    const a = service.encrypt('same-value');
    const b = service.encrypt('same-value');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same-value');
    expect(service.decrypt(b)).toBe('same-value');
  });

  it('rejects a tampered ciphertext instead of silently returning wrong data (negative case)', () => {
    const service = makeService(TEST_KEY);
    const encrypted = service.encrypt('super-secret-refresh-token');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    // Flip the ciphertext without touching the auth tag — GCM's
    // authentication must catch this, not just decrypt to garbage.
    const tamperedBuf = Buffer.from(ciphertext, 'base64');
    tamperedBuf[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedBuf.toString('base64')].join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('throws at construction time when the key is missing or the wrong length (negative case)', () => {
    expect(() => makeService(undefined)).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => makeService('too-short')).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });
});
