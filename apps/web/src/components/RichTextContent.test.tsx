import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichTextContent } from './RichTextContent';

describe('RichTextContent', () => {
  it('renders formatted HTML — headings, lists, bold — as real markup (happy path)', () => {
    render(
      <RichTextContent html="<h2>Responsibilities</h2><ul><li>Ship <strong>features</strong></li></ul>" />,
    );

    expect(screen.getByRole('heading', { name: 'Responsibilities' })).toBeInTheDocument();
    const item = screen.getByText(
      (_, el) => el?.tagName === 'LI' && el.textContent === 'Ship features',
    );
    expect(item.querySelector('strong')).toHaveTextContent('features');
  });

  it('renders pre-existing Markdown-ish text (from the extension) as real formatting, not raw syntax (edge case)', () => {
    // Applications captured before the rich-text editor existed still
    // have "## Heading" / "- item" text in jobDescription, not HTML —
    // must render with real formatting, not literal ## / - characters.
    // Blocks are blank-line-separated, matching what elementToMarkdown
    // (packages/scrapers/src/html-to-markdown.ts) actually produces.
    render(<RichTextContent html={'## Responsibilities\n\n- Ship features'} />);

    expect(screen.getByRole('heading', { name: 'Responsibilities' })).toBeInTheDocument();
    expect(screen.queryByText(/## Responsibilities/)).not.toBeInTheDocument();
    const item = screen.getByText(
      (_, el) => el?.tagName === 'LI' && el.textContent === 'Ship features',
    );
    expect(item).toBeInTheDocument();
  });

  it('strips a script tag instead of executing or rendering it (negative case)', () => {
    render(<RichTextContent html="<p>Safe</p><script>window.__pwned = true;</script>" />);

    expect(screen.getByText('Safe')).toBeInTheDocument();
    expect(document.querySelector('script')).not.toBeInTheDocument();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
