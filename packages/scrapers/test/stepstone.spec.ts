import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesStepStone, extractStepStone } from '../src/adapters/stepstone';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/stepstone-job.html'), 'utf-8');

describe('matchesStepStone', () => {
  it('matches StepStone job posting URLs across ccTLDs (happy path)', () => {
    expect(matchesStepStone('https://www.stepstone.de/stellenangebote--1')).toBe(true);
    expect(matchesStepStone('https://www.stepstone.at/stellenangebote--1')).toBe(true);
  });

  it('does not match a non-StepStone URL, and does not throw on an invalid one (negative case)', () => {
    expect(matchesStepStone('https://example.com/jobs/1')).toBe(false);
    expect(matchesStepStone('not a url')).toBe(false);
  });
});

describe('extractStepStone', () => {
  it('extracts the job posting via JSON-LD and forces applyType to stepstone (happy path)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractStepStone(doc);

    expect(result.applyType).toEqual({
      value: 'stepstone',
      confidence: 1,
      source: 'site-adapter',
    });
    expect(result.jobTitle?.value).toBe('Backend Entwickler (m/w/d)');
    expect(result.companyName?.value).toBe('Muster AG');
    expect(result.locationRaw?.value).toBe('Munich, DE');
  });

  it('still sets applyType when the page has no JSON-LD at all (edge case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Some Job</title></head><body></body></html>',
      'text/html',
    );

    const result = extractStepStone(doc);

    expect(result.applyType?.value).toBe('stepstone');
    expect(result.jobTitle?.value).toBe('Some Job');
  });
});
