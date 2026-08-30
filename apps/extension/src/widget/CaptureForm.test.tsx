import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureForm } from './CaptureForm';
import { ApiError } from '../lib/api-client';
import type { ExtractedJobPosting } from '@bewerber/scrapers';

const checkDuplicateMock = vi.fn();
const createApplicationMock = vi.fn();

vi.mock('../lib/applications', () => ({
  checkDuplicate: (...args: unknown[]) => checkDuplicateMock(...args),
  createApplication: (...args: unknown[]) => createApplicationMock(...args),
}));

const extraction: ExtractedJobPosting = {
  jobTitle: { value: 'Backend Engineer', confidence: 0.9, source: 'json-ld' },
  companyName: { value: 'Acme Corp', confidence: 0.9, source: 'json-ld' },
  locationRaw: { value: 'Berlin', confidence: 0.85, source: 'json-ld' },
  jobDescription: { value: 'Build things.', confidence: 0.85, source: 'json-ld' },
};

describe('CaptureForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the form from the extraction and saves on submit (happy path)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ _id: 'app-1' });
    render(<CaptureForm url="https://example.com/jobs/1" extraction={extraction} />);

    expect(await screen.findByDisplayValue('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    await vi.waitFor(() => expect(createApplicationMock).toHaveBeenCalled());
    expect(createApplicationMock.mock.calls[0][0]).toMatchObject({
      jobTitle: 'Backend Engineer',
      company: { name: 'Acme Corp' },
      applyLink: 'https://example.com/jobs/1',
    });
    expect(await screen.findByText(/saved to your application tracker/i)).toBeInTheDocument();
  });

  it('shows and saves an extracted posted date, and omits both when none was found (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ _id: 'app-1' });
    const postedAt = new Date('2026-08-28T01:00:00.000Z');
    render(
      <CaptureForm
        url="https://example.com/jobs/1"
        extraction={{
          ...extraction,
          postedAt: { value: postedAt, confidence: 0.7, source: 'site-adapter' },
        }}
      />,
    );

    expect(
      await screen.findByText(new RegExp(`Posted ${postedAt.toLocaleDateString()}`)),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    await vi.waitFor(() => expect(createApplicationMock).toHaveBeenCalled());
    expect(createApplicationMock.mock.calls[0][0]).toMatchObject({ postedAt });
  });

  it('omits the posted-date note when none was found (negative case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    render(<CaptureForm url="https://example.com/jobs/1" extraction={extraction} />);

    await screen.findByLabelText(/job title/i);
    expect(screen.queryByText(/^Posted /)).not.toBeInTheDocument();
  });

  it('saves the extracted off-site apply link instead of the tab URL, and duplicate-checks against it (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ _id: 'app-1' });
    render(
      <CaptureForm
        url="https://www.linkedin.com/jobs/view/123"
        extraction={{
          ...extraction,
          applyLink: {
            value: 'https://acme.example.com/careers/backend-engineer',
            confidence: 0.9,
            source: 'site-adapter',
          },
        }}
      />,
    );

    await vi.waitFor(() =>
      expect(checkDuplicateMock).toHaveBeenCalledWith(
        'https://acme.example.com/careers/backend-engineer',
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: /save application/i }));

    await vi.waitFor(() => expect(createApplicationMock).toHaveBeenCalled());
    expect(createApplicationMock.mock.calls[0][0]).toMatchObject({
      applyLink: 'https://acme.example.com/careers/backend-engineer',
    });
  });

  it('shows a duplicate warning when the apply link is already tracked (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: true, id: 'app-existing' });
    render(<CaptureForm url="https://example.com/jobs/1" extraction={{}} />);

    expect(await screen.findByText(/already have an application saved/i)).toBeInTheDocument();
  });

  it('links location to a Google Maps search, updating as the field is edited (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    render(<CaptureForm url="https://example.com/jobs/1" extraction={extraction} />);

    const mapsLink = await screen.findByRole('link', { name: /open in maps/i });
    expect(mapsLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Berlin',
    );

    const locationInput = screen.getByLabelText(/location/i);
    await userEvent.clear(locationInput);
    await userEvent.type(locationInput, 'Vienna, Austria');

    expect(screen.getByRole('link', { name: /open in maps/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Vienna%2C%20Austria',
    );
  });

  it('hides the Maps link when location is empty (negative case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    render(<CaptureForm url="https://example.com/jobs/1" extraction={{}} />);

    await screen.findByLabelText(/job title/i);
    expect(screen.queryByRole('link', { name: /open in maps/i })).not.toBeInTheDocument();
  });

  it('shows the server error and does not clear the form when saving fails (negative case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockRejectedValueOnce(new ApiError(400, 'jobTitle is required'));
    render(<CaptureForm url="https://example.com/jobs/1" extraction={extraction} />);

    const jobTitleInput = await screen.findByDisplayValue('Backend Engineer');
    await userEvent.clear(jobTitleInput);
    await userEvent.type(jobTitleInput, 'QA Engineer');
    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    expect(await screen.findByText('jobTitle is required')).toBeInTheDocument();
    expect(screen.getByDisplayValue('QA Engineer')).toBeInTheDocument();
  });
});
