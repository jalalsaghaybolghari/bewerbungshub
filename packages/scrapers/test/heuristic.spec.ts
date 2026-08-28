import { describe, expect, it } from 'vitest';
import { extractHeuristic } from '../src/extractors/heuristic';

function docFromHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extractHeuristic', () => {
  it('uses the first h1 and meta description (happy path)', () => {
    const doc = docFromHtml(`
      <html><head>
        <title>Ignored Page Title</title>
        <meta name="description" content="A job worth doing." />
      </head><body>
        <h1>Support Engineer</h1>
      </body></html>
    `);

    const result = extractHeuristic(doc);

    expect(result.jobTitle).toEqual({
      value: 'Support Engineer',
      confidence: 0.2,
      source: 'heuristic',
    });
    expect(result.jobDescription).toEqual({
      value: 'A job worth doing.',
      confidence: 0.2,
      source: 'heuristic',
    });
  });

  it('falls back to the page <title> when there is no h1 (edge case)', () => {
    const doc = docFromHtml(
      '<html><head><title>Careers at Acme</title></head><body></body></html>',
    );

    const result = extractHeuristic(doc);

    expect(result.jobTitle?.value).toBe('Careers at Acme');
  });

  it('omits jobDescription when there is no meta description (negative case)', () => {
    const doc = docFromHtml('<html><head><title>Careers</title></head><body></body></html>');

    const result = extractHeuristic(doc);

    expect(result.jobDescription).toBeUndefined();
  });
});
