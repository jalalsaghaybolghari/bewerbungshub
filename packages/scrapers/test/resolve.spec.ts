import { describe, expect, it } from 'vitest';
import { resolveJobPosting } from '../src/resolve';

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('resolveJobPosting', () => {
  it('uses the LinkedIn adapter for a LinkedIn job URL (happy path)', () => {
    const doc = docFromHtml(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer | LinkedIn"}</script></head></html>',
    );

    const result = resolveJobPosting('https://www.linkedin.com/jobs/view/1', doc);

    expect(result.applyType?.value).toBe('linkedin');
    expect(result.jobTitle?.value).toBe('Engineer');
  });

  it('uses the Xing adapter for a Xing job URL (happy path)', () => {
    const doc = docFromHtml(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script></head></html>',
    );

    const result = resolveJobPosting('https://www.xing.com/jobs/example-1', doc);

    expect(result.applyType?.value).toBe('xing');
    expect(result.jobTitle?.value).toBe('Engineer');
  });

  it('uses the StepStone adapter for any StepStone ccTLD (happy path)', () => {
    const doc = docFromHtml(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script></head></html>',
    );

    const result = resolveJobPosting('https://www.stepstone.at/stellenangebote--1', doc);

    expect(result.applyType?.value).toBe('stepstone');
    expect(result.jobTitle?.value).toBe('Engineer');
  });

  it('uses the Indeed adapter for any Indeed ccTLD (happy path)', () => {
    const doc = docFromHtml(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script></head></html>',
    );

    const result = resolveJobPosting('https://de.indeed.com/viewjob?jk=1', doc);

    expect(result.applyType?.value).toBe('indeed');
    expect(result.jobTitle?.value).toBe('Engineer');
  });

  it('falls back to the generic pipeline for an unrecognized site (edge case)', () => {
    const doc = docFromHtml(
      '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script></head></html>',
    );

    const result = resolveJobPosting('https://careers.example.com/jobs/1', doc);

    expect(result.applyType).toBeUndefined();
    expect(result.jobTitle?.value).toBe('Engineer');
  });

  it('still returns a heuristic extraction for a page with no structured data at all (negative case)', () => {
    const doc = docFromHtml('<html><head><title>Some Job</title></head><body></body></html>');

    const result = resolveJobPosting('https://careers.example.com/jobs/2', doc);

    expect(result.jobTitle).toEqual({ value: 'Some Job', confidence: 0.2, source: 'heuristic' });
  });
});
