import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyableUrlField } from './CopyableUrlField';

describe('CopyableUrlField', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the value read-only, links to it, and copies it on click (happy path)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyableUrlField label="Original posting" value="https://example.com/jobs/1" />);

    const input = screen.getByDisplayValue('https://example.com/jobs/1');
    expect(input).toHaveAttribute('readonly');

    expect(screen.getByRole('link', { name: 'Original posting' })).toHaveAttribute(
      'href',
      'https://example.com/jobs/1',
    );

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith('https://example.com/jobs/1');
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('does not throw when the clipboard API is unavailable (negative case)', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<CopyableUrlField label="Original posting" value="https://example.com/jobs/1" />);

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));

    // Stays on the un-copied label — no crash, no false "Copied!" state.
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument();
  });

  it('does not render a clickable link for a javascript: URL (negative case — stored XSS guard)', () => {
    render(<CopyableUrlField label="Original posting" value="javascript:alert(1)" />);

    expect(screen.queryByRole('link', { name: 'Original posting' })).not.toBeInTheDocument();
    // Still visible/copiable as plain text — just not a clickable navigation.
    expect(screen.getByDisplayValue('javascript:alert(1)')).toBeInTheDocument();
  });
});
