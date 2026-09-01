import { describe, expect, it } from 'vitest';
import { elementToMarkdown } from '../src/html-to-markdown';

function elementFromHtml(html: string): Element {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  return doc.getElementById('root')!;
}

describe('elementToMarkdown', () => {
  it('converts paragraphs, bold, italic, and a bullet list (happy path)', () => {
    const el = elementFromHtml(`
      <p>We are looking for a <strong>Senior Engineer</strong> to join our team.</p>
      <p>You will work in an <em>agile</em> environment.</p>
      <ul>
        <li>5+ years of experience</li>
        <li>Strong TypeScript skills</li>
      </ul>
    `);

    const result = elementToMarkdown(el);

    expect(result).toBe(
      'We are looking for a **Senior Engineer** to join our team.\n\n' +
        'You will work in an *agile* environment.\n\n' +
        '- 5+ years of experience\n- Strong TypeScript skills',
    );
  });

  it('converts headings and an ordered list, and collapses <br> to newlines within a block (edge case)', () => {
    const el = elementFromHtml(`
      <h2>Responsibilities</h2>
      <p>Line one<br>Line two</p>
      <ol>
        <li>First step</li>
        <li>Second step</li>
      </ol>
    `);

    const result = elementToMarkdown(el);

    expect(result).toBe(
      '## Responsibilities\n\nLine one\nLine two\n\n1. First step\n2. Second step',
    );
  });

  it('returns an empty string for an element with no text content (negative case)', () => {
    const el = elementFromHtml('<div><span></span></div>');

    expect(elementToMarkdown(el)).toBe('');
  });

  it('skips <button> elements entirely, since they are UI chrome rather than content (edge case)', () => {
    const el = elementFromHtml(`
      <p>Real content.</p>
      <button>nach Oben</button>
    `);

    expect(elementToMarkdown(el)).toBe('Real content.');
  });

  it('does not throw on comment nodes interleaved between elements (negative case)', () => {
    // Angular templates render `<!---->` placeholder comments between every
    // conditionally-rendered element — real-world DOM, not a contrived
    // input. This crashed live against a real AMS page before the fix.
    const el = elementFromHtml(`
      <!---->
      <p>Real content.</p>
      <!---->
      <ul><!----><li>Item one</li><!----></ul>
      <!---->
    `);

    expect(elementToMarkdown(el)).toBe('Real content.\n\n- Item one');
  });

  it('finds a list nested inside a non-block wrapper, not just a direct child (edge case)', () => {
    // Real LinkedIn markup: <p><span data-testid="expandable-text-box">
    // <ul>...</ul></span></p> — the <ul> is the <span>'s direct child, but
    // the <p>'s direct child is only the <span>, which isn't itself a
    // block tag. A direct-children-only check never looks inside it, so
    // the whole subtree (including the list) fell into the flat inline()
    // path and lost its bullet points entirely — live-verified live via a
    // real captured page, not a hypothetical.
    const el = elementFromHtml(`
      <p><span data-testid="expandable-text-box">
        <strong>Intro line.</strong>
        <ul>
          <li>First responsibility</li>
          <li>Second responsibility</li>
        </ul>
      </span></p>
    `);

    expect(elementToMarkdown(el)).toBe(
      '**Intro line.**\n\n- First responsibility\n- Second responsibility',
    );
  });
});
