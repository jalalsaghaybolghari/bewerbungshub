import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CaptureView } from './CaptureView';
import { CaptureError } from '../lib/capture';

const captureActiveTabMock = vi.fn();

vi.mock('../lib/capture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/capture')>();
  return { ...actual, captureActiveTab: () => captureActiveTabMock() };
});

vi.mock('./CaptureForm', () => ({
  CaptureForm: ({ url }: { url: string }) => <div>mock capture form for {url}</div>,
}));

describe('CaptureView', () => {
  it('renders the capture form with the captured tab once extraction succeeds (happy path)', async () => {
    captureActiveTabMock.mockResolvedValueOnce({ url: 'https://example.com/job', extraction: {} });
    render(<CaptureView />);

    expect(
      await screen.findByText(/mock capture form for https:\/\/example\.com\/job/i),
    ).toBeInTheDocument();
  });

  it('shows the CaptureError message when injection fails (edge case)', async () => {
    captureActiveTabMock.mockRejectedValueOnce(
      new CaptureError('Could not read this page. Try a regular job posting page.'),
    );
    render(<CaptureView />);

    expect(await screen.findByText(/could not read this page/i)).toBeInTheDocument();
  });

  it('falls back to a generic error message for an unexpected failure (negative case)', async () => {
    captureActiveTabMock.mockRejectedValueOnce(new Error('boom'));
    render(<CaptureView />);

    expect(await screen.findByText(/could not read this page\.$/i)).toBeInTheDocument();
  });
});
