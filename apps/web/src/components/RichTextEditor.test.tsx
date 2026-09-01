import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RichTextEditor } from './RichTextEditor';

// No real-typing coverage here: simulating keystrokes into a
// contentEditable ProseMirror view under jsdom is genuinely flaky
// (confirmed live — characters landed out of order/dropped, a timing
// issue between userEvent's synthetic events and ProseMirror's
// MutationObserver-based reconciliation, not a bug in the component).
// Toolbar-button clicks exercise real editor commands reliably instead.
describe('RichTextEditor', () => {
  it('renders the initial HTML content (happy path)', () => {
    render(<RichTextEditor value="<p>Build things.</p>" onChange={() => {}} />);

    expect(screen.getByText('Build things.')).toBeInTheDocument();
  });

  it('renders every core toolbar action without throwing when clicked (happy path)', async () => {
    render(<RichTextEditor value="<p>Hello</p>" onChange={() => {}} />);

    for (const name of [
      'Bold',
      'Italic',
      'Underline',
      'Heading',
      'Subheading',
      'Bullet list',
      'Numbered list',
      'Quote',
    ]) {
      await userEvent.click(screen.getByRole('button', { name }));
    }

    // Still renders — a thrown command would have unmounted or errored.
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('resyncs when the value prop changes from outside, e.g. an async data load (edge case)', () => {
    const { rerender } = render(<RichTextEditor value="<p>Loading…</p>" onChange={() => {}} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    rerender(<RichTextEditor value="<p>Real description.</p>" onChange={() => {}} />);

    expect(screen.getByText('Real description.')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
