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
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

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

  it('shows an offline message instead of a hard error when the save gets queued (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'queued' });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    expect(await screen.findByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.queryByText(/saved to your application tracker/i)).not.toBeInTheDocument();
    // Same follow-up actions as a real save — the data isn't lost, just deferred.
    expect(screen.getByRole('button', { name: /show form again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });

  it('calls onClose when the Close button is clicked after saving (happy path)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    const onClose = vi.fn();
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('brings the filled-in form back when "Show form again" is clicked after saving (happy path)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));
    await userEvent.click(await screen.findByRole('button', { name: /show form again/i }));

    expect(screen.getByDisplayValue('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText(/saved to your application tracker/i)).not.toBeInTheDocument();
  });

  it('shows and saves an extracted posted date, and omits both when none was found (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    const postedAt = new Date('2026-08-28T01:00:00.000Z');
    render(
      <CaptureForm
        url="https://example.com/jobs/1"
        extraction={{
          ...extraction,
          postedAt: { value: postedAt, confidence: 0.7, source: 'site-adapter' },
        }}
        onClose={vi.fn()}
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
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    await screen.findByLabelText(/job title/i);
    expect(screen.queryByText(/^Posted /)).not.toBeInTheDocument();
  });

  it('saves the extracted off-site apply link instead of the tab URL, and duplicate-checks against it (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
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
        onClose={vi.fn()}
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
    render(<CaptureForm url="https://example.com/jobs/1" extraction={{}} onClose={vi.fn()} />);

    expect(await screen.findByText(/already have an application saved/i)).toBeInTheDocument();
  });

  it('links location to a Google Maps search, updating as the field is edited (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

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
    render(<CaptureForm url="https://example.com/jobs/1" extraction={{}} onClose={vi.fn()} />);

    await screen.findByLabelText(/job title/i);
    expect(screen.queryByRole('link', { name: /open in maps/i })).not.toBeInTheDocument();
  });

  it('defaults status to draft, and saves it as-is when left alone (happy path)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    expect(await screen.findByLabelText(/status/i)).toHaveValue('draft');

    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    await vi.waitFor(() => expect(createApplicationMock).toHaveBeenCalled());
    expect(createApplicationMock.mock.calls[0][0]).toMatchObject({ status: 'draft' });
  });

  it('saves the status the user picks instead of the draft default (edge case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockResolvedValueOnce({ status: 'saved', id: 'app-1' });
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    await userEvent.selectOptions(await screen.findByLabelText(/status/i), 'applied');
    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    await vi.waitFor(() => expect(createApplicationMock).toHaveBeenCalled());
    expect(createApplicationMock.mock.calls[0][0]).toMatchObject({ status: 'applied' });
  });

  it('shows the server error and does not clear the form when saving fails (negative case)', async () => {
    checkDuplicateMock.mockResolvedValueOnce({ exists: false, id: null });
    createApplicationMock.mockRejectedValueOnce(new ApiError(400, 'jobTitle is required'));
    render(
      <CaptureForm url="https://example.com/jobs/1" extraction={extraction} onClose={vi.fn()} />,
    );

    const jobTitleInput = await screen.findByDisplayValue('Backend Engineer');
    await userEvent.clear(jobTitleInput);
    await userEvent.type(jobTitleInput, 'QA Engineer');
    await userEvent.click(screen.getByRole('button', { name: /save application/i }));

    expect(await screen.findByText('jobTitle is required')).toBeInTheDocument();
    expect(screen.getByDisplayValue('QA Engineer')).toBeInTheDocument();
  });
});
