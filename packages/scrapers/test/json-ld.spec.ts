import { describe, expect, it } from 'vitest';
import { extractJsonLd } from '../src/extractors/json-ld';

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractJsonLd', () => {
  it('extracts title, company, location, and description from a JobPosting node (happy path)', () => {
    const doc = docFromHtml(`
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Senior Backend Engineer",
            "hiringOrganization": { "name": "Acme Corp" },
            "jobLocation": { "address": { "addressLocality": "Berlin", "addressCountry": "DE" } },
            "description": "<p>Build things.</p>"
          }
        </script>
      </head><body></body></html>
    `);

    const result = extractJsonLd(doc);

    expect(result.jobTitle).toEqual({
      value: 'Senior Backend Engineer',
      confidence: 0.9,
      source: 'json-ld',
    });
    expect(result.companyName).toEqual({ value: 'Acme Corp', confidence: 0.9, source: 'json-ld' });
    expect(result.locationRaw).toEqual({
      value: 'Berlin, DE',
      confidence: 0.85,
      source: 'json-ld',
    });
    expect(result.jobDescription).toEqual({
      value: 'Build things.',
      confidence: 0.85,
      source: 'json-ld',
    });
  });

  it('finds a JobPosting node inside an @graph array (edge case)', () => {
    const doc = docFromHtml(`
      <html><head>
        <script type="application/ld+json">
          { "@graph": [
            { "@type": "WebPage" },
            { "@type": "JobPosting", "title": "QA Engineer" }
          ]}
        </script>
      </head></html>
    `);

    const result = extractJsonLd(doc);

    expect(result.jobTitle?.value).toBe('QA Engineer');
  });

  it('returns an empty extraction when there is no JobPosting JSON-LD (negative case)', () => {
    const doc = docFromHtml(`
      <html><head>
        <script type="application/ld+json">{ "@type": "WebPage", "name": "Careers" }</script>
      </head></html>
    `);

    expect(extractJsonLd(doc)).toEqual({});
  });

  it('skips malformed JSON-LD instead of throwing (negative case)', () => {
    const doc = docFromHtml(`
      <html><head>
        <script type="application/ld+json">{ not valid json </script>
      </head></html>
    `);

    expect(() => extractJsonLd(doc)).not.toThrow();
    expect(extractJsonLd(doc)).toEqual({});
  });
});
