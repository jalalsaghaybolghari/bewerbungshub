import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedJobPosting } from '@bewerber/scrapers';
import { CaptureView } from './CaptureView';

const captureFormPropsSpy = vi.fn();
vi.mock('./CaptureForm', () => ({
  CaptureForm: ({
    url,
    extraction,
    onClose,
  }: {
    url: string;
    extraction: ExtractedJobPosting;
    onClose: () => void;
  }) => {
    captureFormPropsSpy({ onClose });
    return (
      <div>
        mock capture form for {url} ({Object.keys(extraction).length} fields)
      </div>
    );
  },
}));

describe('CaptureView', () => {
  afterEach(() => {
    captureFormPropsSpy.mockClear();
  });

  it('renders the capture form with the given url and extraction (happy path)', () => {
    render(
      <CaptureView
        url="https://example.com/job"
        extraction={{ jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' } }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/mock capture form for https:\/\/example\.com\/job \(1 fields\)/i),
    ).toBeInTheDocument();
  });

  it('renders the capture form with an empty extraction when none was found (edge case)', () => {
    render(<CaptureView url="https://example.com/job" onClose={vi.fn()} />);

    expect(
      screen.getByText(/mock capture form for https:\/\/example\.com\/job \(0 fields\)/i),
    ).toBeInTheDocument();
  });

  it('shows the error message instead of the form when extraction failed (negative case)', () => {
    render(
      <CaptureView
        url="https://example.com/job"
        error="Could not read this page. Try a regular job posting page."
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/could not read this page/i)).toBeInTheDocument();
    expect(screen.queryByText(/mock capture form/i)).not.toBeInTheDocument();
  });

  it('passes onClose through to the capture form (happy path)', () => {
    const onClose = vi.fn();
    render(<CaptureView url="https://example.com/job" onClose={onClose} />);

    expect(captureFormPropsSpy).toHaveBeenCalledWith({ onClose });
  });
});
