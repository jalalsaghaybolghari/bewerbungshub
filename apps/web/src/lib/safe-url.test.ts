import { describe, expect, it } from 'vitest';
import { isSafeHref } from './safe-url';

describe('isSafeHref', () => {
  it('accepts http and https URLs (happy path)', () => {
    expect(isSafeHref('https://example.com')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
  });

  it('rejects a javascript: URI (negative case)', () => {
    expect(isSafeHref('javascript:alert(document.cookie)')).toBe(false);
  });

  it('rejects a data: URI (negative case)', () => {
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects an unparseable value (negative case)', () => {
    expect(isSafeHref('not a url')).toBe(false);
  });
});
