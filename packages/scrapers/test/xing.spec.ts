import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesXing, extractXing } from '../src/adapters/xing';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/xing-job.html'), 'utf-8');

describe('matchesXing', () => {
  it('matches a Xing job posting URL (happy path)', () => {
    expect(matchesXing('https://www.xing.com/jobs/example-1')).toBe(true);
  });

  it('does not match a non-Xing URL, and does not throw on an invalid one (negative case)', () => {
    expect(matchesXing('https://example.com/jobs/1')).toBe(false);
    expect(matchesXing('not a url')).toBe(false);
  });
});

describe('extractXing', () => {
  it('extracts the job posting via JSON-LD and forces applyType to xing (happy path)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractXing(doc);

    expect(result.applyType).toEqual({ value: 'xing', confidence: 1, source: 'site-adapter' });
    expect(result.jobTitle?.value).toBe('Frontend Developer (m/w/d)');
    expect(result.companyName?.value).toBe('Beispiel GmbH');
    expect(result.locationRaw?.value).toBe('Vienna, AT');
  });

  it('still sets applyType when the page has no JSON-LD at all (edge case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Some Job</title></head><body></body></html>',
      'text/html',
    );

    const result = extractXing(doc);

    expect(result.applyType?.value).toBe('xing');
    expect(result.jobTitle?.value).toBe('Some Job');
  });
});
