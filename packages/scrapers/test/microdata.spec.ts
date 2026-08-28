import { describe, expect, it } from 'vitest';
import { extractMicrodata } from '../src/extractors/microdata';

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractMicrodata', () => {
  it('extracts fields from schema.org microdata attributes (happy path)', () => {
    const doc = docFromHtml(`
      <html><body>
        <div itemscope itemtype="https://schema.org/JobPosting">
          <span itemprop="title">Data Analyst</span>
          <span itemprop="hiringOrganization">Globex</span>
          <span itemprop="jobLocation">Munich</span>
          <span itemprop="description">Analyze data.</span>
        </div>
      </body></html>
    `);

    const result = extractMicrodata(doc);

    expect(result.jobTitle).toEqual({
      value: 'Data Analyst',
      confidence: 0.6,
      source: 'microdata',
    });
    expect(result.companyName).toEqual({ value: 'Globex', confidence: 0.55, source: 'microdata' });
    expect(result.locationRaw).toEqual({ value: 'Munich', confidence: 0.55, source: 'microdata' });
    expect(result.jobDescription).toEqual({
      value: 'Analyze data.',
      confidence: 0.6,
      source: 'microdata',
    });
  });

  it('falls back to OpenGraph tags when microdata is absent (edge case)', () => {
    const doc = docFromHtml(`
      <html><head>
        <meta property="og:title" content="Product Manager" />
        <meta property="og:site_name" content="Initech" />
        <meta property="og:description" content="Manage products." />
      </head></html>
    `);

    const result = extractMicrodata(doc);

    expect(result.jobTitle?.value).toBe('Product Manager');
    expect(result.companyName?.value).toBe('Initech');
    expect(result.jobDescription?.value).toBe('Manage products.');
  });

  it('returns an empty extraction when neither microdata nor OpenGraph tags are present (negative case)', () => {
    const doc = docFromHtml('<html><body><p>Nothing here.</p></body></html>');

    expect(extractMicrodata(doc)).toEqual({});
  });
});
