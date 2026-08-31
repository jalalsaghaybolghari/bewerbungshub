import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchesAms, extractAms } from '../src/adapters/ams';

const fixtureHtml = readFileSync(join(__dirname, 'fixtures/ams-job.html'), 'utf-8');

describe('matchesAms', () => {
  it('matches a jobs.ams.at job posting URL (happy path)', () => {
    expect(
      matchesAms('https://jobs.ams.at/public/emps/jobs/3fb9334a-edaf-38e3-83e6-c03c84fb4070'),
    ).toBe(true);
  });

  it('does not match a non-AMS URL, and does not throw on an invalid one (negative case)', () => {
    expect(matchesAms('https://example.com/jobs/1')).toBe(false);
    expect(matchesAms('https://www.ams.at/some/other/page')).toBe(false);
    expect(matchesAms('not a url')).toBe(false);
  });
});

describe('extractAms', () => {
  it('reads title/company/location/description from the real, verified detail-page ids (happy path)', () => {
    const doc = new DOMParser().parseFromString(fixtureHtml, 'text/html');

    const result = extractAms(doc);

    expect(result.applyType).toEqual({ value: 'ams', confidence: 1, source: 'site-adapter' });
    expect(result.jobTitle).toEqual({
      value: 'SoftwareentwicklerIn',
      confidence: 0.85,
      source: 'site-adapter',
    });
    expect(result.companyName).toEqual({
      value: 'ASING engineering e.U.',
      confidence: 0.85,
      source: 'site-adapter',
    });
    expect(result.locationRaw).toEqual({
      value: 'Gusenleithnergasse 11/3, 1140, Wien,Penzing',
      confidence: 0.8,
      source: 'site-adapter',
    });

    // jobDescription is the *whole* content section as Markdown, not just
    // the "Stellenbeschreibung" paragraph — company description,
    // competencies, and contact details all live in the same
    // <lib-detail-content> element on the real page.
    expect(result.jobDescription?.confidence).toBe(0.8);
    expect(result.jobDescription?.source).toBe('site-adapter');
    const description = result.jobDescription?.value ?? '';
    expect(description).toContain('## Unternehmensbeschreibung');
    expect(description).toContain('Wir sind ein Unternehmen in 1140 Wien');
    expect(description).toContain('## Stellenbeschreibung');
    expect(description).toContain('Unser Unternehmen sucht einen Softwareentwickler');
    expect(description).toContain('### Kompetenzen');
    expect(description).toContain('- App programmieren');
    expect(description).toContain('Herr Arif Sahin');
    // UI chrome, not real content — must not leak into the description.
    expect(description).not.toContain('nach Oben');
  });

  it('falls back to splitting the <h1>\'s "bei <company>" text when the verified ids are missing (edge case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><h1><span>SoftwareentwicklerIn</span> bei <span>BEKO Solutions GmbH</span></h1></body></html>',
      'text/html',
    );

    const result = extractAms(doc);

    expect(result.jobTitle).toEqual({
      value: 'SoftwareentwicklerIn',
      confidence: 0.5,
      source: 'site-adapter',
    });
    expect(result.companyName).toEqual({
      value: 'BEKO Solutions GmbH',
      confidence: 0.5,
      source: 'site-adapter',
    });
    expect(result.locationRaw).toBeUndefined();
    expect(result.jobDescription).toBeUndefined();
  });

  it('does not extract the stale og:title/meta-description when nothing else is present (negative case)', () => {
    const doc = new DOMParser().parseFromString(
      `<html><head>
        <title>alle jobs - die Stellensuche des AMS</title>
        <meta name="description" content="alle jobs - Mit einem Klick alle aktuellen Stellenangebote..." />
        <meta property="og:title" content="alle jobs - die Stellensuche des AMS" />
      </head><body></body></html>`,
      'text/html',
    );

    const result = extractAms(doc);

    expect(result.applyType?.value).toBe('ams');
    // No verified ids and no <h1> at all — falls all the way through to
    // heuristic's document.title fallback, same stale value a real page
    // would show before the SPA finishes rendering. jobDescription stays
    // unset rather than picking up the stale meta description.
    expect(result.jobTitle?.value).toBe('alle jobs - die Stellensuche des AMS');
    expect(result.jobDescription).toBeUndefined();
  });

  it('still sets applyType when the page has no JSON-LD, meta tags, or ids at all (negative case)', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Some Job</title></head><body></body></html>',
      'text/html',
    );

    const result = extractAms(doc);

    expect(result.applyType?.value).toBe('ams');
    expect(result.jobTitle?.value).toBe('Some Job');
  });
});
