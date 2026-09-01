import { describe, expect, it } from 'vitest';
import { looksLikeHtml, markdownToHtml, toEditableHtml } from './markdown-to-html';

describe('markdownToHtml', () => {
  it('converts headings, bold, italic, and a bullet list — the shape elementToMarkdown produces (happy path)', () => {
    const markdown = [
      '## Responsibilities',
      '',
      'Build things with **React** and *TypeScript*.',
      '',
      '- Ship features',
      '- Write tests',
    ].join('\n');

    expect(markdownToHtml(markdown)).toBe(
      '<h2>Responsibilities</h2>' +
        '<p>Build things with <strong>React</strong> and <em>TypeScript</em>.</p>' +
        '<ul><li>Ship features</li><li>Write tests</li></ul>',
    );
  });

  it('converts an ordered list (edge case)', () => {
    expect(markdownToHtml('1. First step\n2. Second step')).toBe(
      '<ol><li>First step</li><li>Second step</li></ol>',
    );
  });

  it('turns a single newline within a paragraph into <br>, not a new paragraph (edge case)', () => {
    expect(markdownToHtml('Line one\nLine two')).toBe('<p>Line one<br>Line two</p>');
  });

  it('escapes HTML special characters in plain text instead of interpreting them (negative case)', () => {
    expect(markdownToHtml('Salary < 50k & > 30k')).toBe('<p>Salary &lt; 50k &amp; &gt; 30k</p>');
  });

  it('returns an empty string for empty or whitespace-only input (negative case)', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   \n  ')).toBe('');
  });
});

describe('looksLikeHtml', () => {
  it('recognizes real HTML tags (happy path)', () => {
    expect(looksLikeHtml('<p>Hello</p>')).toBe(true);
  });

  it('does not false-positive on a stray comparison operator (negative case)', () => {
    expect(looksLikeHtml('Salary < 50k')).toBe(false);
  });
});

describe('toEditableHtml', () => {
  it('passes real HTML through untouched (happy path)', () => {
    expect(toEditableHtml('<p>Already <strong>HTML</strong>.</p>')).toBe(
      '<p>Already <strong>HTML</strong>.</p>',
    );
  });

  it('converts Markdown-ish text (edge case)', () => {
    expect(toEditableHtml('**Bold**')).toBe('<p><strong>Bold</strong></p>');
  });
});
