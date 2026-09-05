import { describe, expect, it } from 'vitest';
import { safeUrlSchema } from './url';

describe('safeUrlSchema', () => {
  it('accepts http and https URLs (happy path)', () => {
    expect(safeUrlSchema.safeParse('https://example.com').success).toBe(true);
    expect(safeUrlSchema.safeParse('http://example.com').success).toBe(true);
  });

  it('rejects a javascript: URI (negative case — stored XSS via a clicked link)', () => {
    const result = safeUrlSchema.safeParse('javascript:alert(document.cookie)');
    expect(result.success).toBe(false);
  });

  it('rejects a data: URI (negative case)', () => {
    const result = safeUrlSchema.safeParse('data:text/html,<script>alert(1)</script>');
    expect(result.success).toBe(false);
  });

  it('rejects a vbscript: URI (negative case)', () => {
    expect(safeUrlSchema.safeParse('vbscript:msgbox(1)').success).toBe(false);
  });

  it('rejects a file: URI (negative case)', () => {
    expect(safeUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
  });

  it('rejects a value that is not a URL at all (negative case)', () => {
    expect(safeUrlSchema.safeParse('not a url').success).toBe(false);
  });
});
