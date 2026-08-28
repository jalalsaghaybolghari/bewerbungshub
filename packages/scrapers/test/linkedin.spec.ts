import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesLinkedIn, extractLinkedIn } from '../src/adapters/linkedin';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/linkedin-job.html'), 'utf-8');

describe('matchesLinkedIn', () => {
  it('matches a LinkedIn job posting URL (happy path)', () => {
    expect(matchesLinkedIn('https://www.linkedin.com/jobs/view/1234567890')).toBe(true);
  });

  it('does not match a LinkedIn profile or feed URL (edge case)', () => {
    expect(matchesLinkedIn('https://www.linkedin.com/in/someone')).toBe(false);
  });

  it('does not match a non-LinkedIn URL, and does not throw on an invalid one (negative case)', () => {
    expect(matchesLinkedIn('https://example.com/jobs/view/1')).toBe(false);
    expect(matchesLinkedIn('not a url')).toBe(false);
  });
});

describe('extractLinkedIn', () => {
  it('extracts the job posting and forces applyType to linkedin (happy path)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.applyType).toEqual({ value: 'linkedin', confidence: 1, source: 'site-adapter' });
    expect(result.companyName?.value).toBe('Example Technologies GmbH');
    expect(result.locationRaw?.value).toBe('Berlin, DE');
  });

  it('strips the " | LinkedIn" suffix from the title (edge case)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.jobTitle?.value).toBe('Senior Software Engineer, Platform');
    expect(result.jobTitle?.source).toBe('site-adapter');
  });

  it('leaves the title untouched when it has no " | LinkedIn" suffix to strip (negative case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Plain Title"}</script></head></html>',
      'text/html',
    );

    const result = extractLinkedIn(doc);

    expect(result.jobTitle?.value).toBe('Plain Title');
  });
});
