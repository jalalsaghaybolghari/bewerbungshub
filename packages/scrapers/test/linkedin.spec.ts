import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLinkedIn, extractLinkedIn } from '../src/adapters/linkedin';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/linkedin-job.html'), 'utf-8');
const noJsonLdFixtureHtml = readFileSync(
  join(__dirname, 'fixtures/linkedin-job-no-jsonld.html'),
  'utf-8',
);
const splitPanelFixtureHtml = readFileSync(
  join(__dirname, 'fixtures/linkedin-job-split-panel.html'),
  'utf-8',
);

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

// Real LinkedIn job pages (verified live, 2026-08-29) ship no JSON-LD,
// microdata, or OpenGraph tags at all — see the comment above
// extractLinkedInDom in src/adapters/linkedin.ts. This is the actually
// common case in practice, not the JSON-LD fixture above.
describe('extractLinkedIn (no JSON-LD, real-world DOM structure)', () => {
  it('extracts company, location, and description from the DOM when there is no structured data (happy path)', () => {
    const doc = new DOMParser().parseFromString(noJsonLdFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.companyName).toEqual({
      value: 'Merkur Versicherung',
      confidence: 0.85,
      source: 'site-adapter',
    });
    expect(result.locationRaw).toEqual({
      value: 'Graz, Styria, Austria',
      confidence: 0.75,
      source: 'site-adapter',
    });
    expect(result.jobDescription?.value).toBe(
      'Jobbeschreibung: Sie arbeiten aktiv in einem **agilen Scrum-Team** mit.\n\n' +
        '- 5+ Jahre Erfahrung\n- Angular und TypeScript',
    );
    expect(result.applyType?.value).toBe('linkedin');
  });

  it('falls back to a suffix-stripped document.title for the title, since it is not reliably in the DOM scope (edge case)', () => {
    const doc = new DOMParser().parseFromString(noJsonLdFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    // The " | LinkedIn" suffix is stripped; a trailing "| CompanyName" (from
    // document.title's own "<title> | <company> | LinkedIn" pattern) is a
    // known, accepted imperfection of this fallback — see extractLinkedIn.
    expect(result.jobTitle?.value).toBe(
      'Senior Angular Frontend Developer (w/m/d) | Merkur Versicherung',
    );
    expect(result.jobTitle?.source).toBe('site-adapter');
  });

  it('ignores unrelated text from other job cards elsewhere on the page (edge case)', () => {
    const doc = new DOMParser().parseFromString(noJsonLdFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.locationRaw?.value).not.toContain('Vienna');
  });

  it('extracts nothing DOM-based when there is no company link or "About the job" heading on the page (negative case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><p>Nothing useful here.</p></body></html>',
      'text/html',
    );

    const result = extractLinkedIn(doc);

    expect(result.companyName).toBeUndefined();
    expect(result.locationRaw).toBeUndefined();
    expect(result.jobDescription).toBeUndefined();
  });
});

// The /jobs/search-results/ split-panel layout includes the job title as one
// of the leaf lines in the same header scope as company/location (unlike the
// standalone page, where it's absent from that scope entirely) — "first line
// after company" alone would wrongly grab the title instead of the location.
describe('extractLinkedIn (split-panel layout, title line present in header scope)', () => {
  it('skips the job title line and finds the real location after it (edge case)', () => {
    const doc = new DOMParser().parseFromString(splitPanelFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.locationRaw).toEqual({
      value: 'Salzburg, Austria',
      confidence: 0.75,
      source: 'site-adapter',
    });
    expect(result.companyName?.value).toBe('Empion');
  });
});

// Both a "Reposted 11 hours ago" line (linkedin-job-no-jsonld.html) and a
// bare "13 hours ago" line (linkedin-job-split-panel.html — the original
// posting date, no repost) should parse into an approximate absolute date.
describe('extractLinkedIn (posted/reposted date)', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses a "Reposted X hours ago" line into an approximate date (happy path)', () => {
    const doc = new DOMParser().parseFromString(noJsonLdFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.postedAt).toEqual({
      value: new Date('2026-08-29T01:00:00.000Z'),
      confidence: 0.7,
      source: 'site-adapter',
    });
  });

  it('parses a bare "X hours ago" line with no "Reposted" prefix (edge case)', () => {
    const doc = new DOMParser().parseFromString(splitPanelFixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.postedAt).toEqual({
      value: new Date('2026-08-28T23:00:00.000Z'),
      confidence: 0.7,
      source: 'site-adapter',
    });
  });

  it('leaves postedAt unset when there is no such line to parse (negative case)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractLinkedIn(doc);

    expect(result.postedAt).toBeUndefined();
  });
});

// Real LinkedIn routes every off-site "Apply" link through a safety-check
// redirector (linkedin.com/safety/go/?url=<encoded target>) rather than
// linking to the employer's site directly — verified live.
describe('extractLinkedIn (apply link)', () => {
  it('decodes the real destination out of the safety redirector URL (happy path)', () => {
    const target = encodeURIComponent(
      'https://merkur.recruitee.com/o/senior-angular-frontend-developer',
    );
    const doc = new DOMParser().parseFromString(
      `<html><body><a aria-label="Apply on company website" href="https://www.linkedin.com/safety/go/?url=${target}&isSdui=true">Apply</a></body></html>`,
      'text/html',
    );

    const result = extractLinkedIn(doc);

    expect(result.applyLink).toEqual({
      value: 'https://merkur.recruitee.com/o/senior-angular-frontend-developer',
      confidence: 0.9,
      source: 'site-adapter',
    });
  });

  it('finds nothing for an Easy Apply posting, which has no such link (edge case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><button aria-label="Easy Apply to Backend Engineer">Easy Apply</button></body></html>',
      'text/html',
    );

    const result = extractLinkedIn(doc);

    expect(result.applyLink).toBeUndefined();
  });

  it('does not throw on a malformed apply href (negative case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><a aria-label="Apply on company website" href="not a url">Apply</a></body></html>',
      'text/html',
    );

    expect(() => extractLinkedIn(doc)).not.toThrow();
    expect(extractLinkedIn(doc).applyLink).toBeUndefined();
  });
});
