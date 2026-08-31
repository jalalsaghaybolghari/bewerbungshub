import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesIndeed, extractIndeed } from '../src/adapters/indeed';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/indeed-job.html'), 'utf-8');

describe('matchesIndeed', () => {
  it('matches Indeed job posting URLs across ccTLDs (happy path)', () => {
    expect(matchesIndeed('https://www.indeed.com/viewjob?jk=1')).toBe(true);
    expect(matchesIndeed('https://de.indeed.com/viewjob?jk=1')).toBe(true);
  });

  it('does not match a non-Indeed URL, and does not throw on an invalid one (negative case)', () => {
    expect(matchesIndeed('https://example.com/jobs/1')).toBe(false);
    expect(matchesIndeed('not a url')).toBe(false);
  });
});

describe('extractIndeed', () => {
  it('extracts the job posting via JSON-LD and forces applyType to indeed (happy path)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractIndeed(doc);

    expect(result.applyType).toEqual({ value: 'indeed', confidence: 1, source: 'site-adapter' });
    expect(result.jobTitle?.value).toBe('QA Engineer');
    expect(result.companyName?.value).toBe('Sample Inc.');
    expect(result.locationRaw?.value).toBe('Berlin, DE');
  });

  it('still sets applyType when the page has no JSON-LD at all (edge case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Some Job</title></head><body></body></html>',
      'text/html',
    );

    const result = extractIndeed(doc);

    expect(result.applyType?.value).toBe('indeed');
    expect(result.jobTitle?.value).toBe('Some Job');
  });
});
