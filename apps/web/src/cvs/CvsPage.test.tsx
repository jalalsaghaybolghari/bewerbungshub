import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CvsPage } from './CvsPage';
import type { Cv, GoogleDriveStatus } from './types';

let cvsData: Cv[] | undefined;
let driveStatus: GoogleDriveStatus | undefined;
const uploadMutateAsync = vi.fn();
const deleteMutate = vi.fn();
let deleteError: { message: string; body?: unknown } | null = null;
const updateMutate = vi.fn();
const disconnectMutate = vi.fn();
const connectGoogleDriveMock = vi.fn();

const openMutate = vi.fn();

vi.mock('./api', () => ({
  useCvs: () => ({ data: cvsData, isLoading: false }),
  useUploadCv: () => ({ mutateAsync: uploadMutateAsync, error: null, isPending: false }),
  useDeleteCv: () => ({
    mutate: deleteMutate,
    isPending: false,
    isError: !!deleteError,
    error: deleteError,
  }),
  useUpdateCv: () => ({ mutate: updateMutate }),
  useOpenCv: () => ({ mutate: openMutate, isPending: false, isError: false }),
  useGoogleDriveStatus: () => ({ data: driveStatus }),
  useDisconnectGoogleDrive: () => ({ mutate: disconnectMutate, isPending: false }),
  connectGoogleDrive: () => connectGoogleDriveMock(),
}));

function makeCv(overrides: Partial<Cv>): Cv {
  return {
    _id: 'cv-1',
    label: 'Main resume',
    language: 'en',
    fileKey: 'cvs/user-1/abc.pdf',
    storageProvider: 'app',
    fileName: 'resume.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12_345,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderAt(path = '/cvs') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CvsPage />
    </MemoryRouter>,
  );
}

describe('CvsPage — Google Drive connection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cvsData = [];
    driveStatus = undefined;
  });

  it('shows a "Connect Google Drive" button when not connected (happy path)', () => {
    driveStatus = { connected: false };
    renderAt();

    expect(screen.getByRole('button', { name: /connect google drive/i })).toBeInTheDocument();
    expect(screen.queryByText(/google drive connected/i)).not.toBeInTheDocument();
  });

  it('starts the connect flow when the button is clicked (happy path)', async () => {
    driveStatus = { connected: false };
    renderAt();

    await userEvent.click(screen.getByRole('button', { name: /connect google drive/i }));

    expect(connectGoogleDriveMock).toHaveBeenCalledTimes(1);
  });

  it('shows connected status and a disconnect button when connected (happy path)', async () => {
    driveStatus = { connected: true, connectedAt: '2026-01-01T00:00:00.000Z' };
    renderAt();

    expect(screen.getByText(/google drive connected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));

    expect(disconnectMutate).toHaveBeenCalledTimes(1);
  });

  it('only shows the "Save to Google Drive" checkbox once connected (edge case)', () => {
    driveStatus = { connected: false };
    const { rerender } = renderAt();

    expect(screen.queryByLabelText(/save to google drive/i)).not.toBeInTheDocument();

    driveStatus = { connected: true };
    rerender(
      <MemoryRouter initialEntries={['/cvs']}>
        <CvsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/save to google drive/i)).toBeInTheDocument();
  });

  it('defaults "Save to Google Drive" to checked once connected (happy path)', () => {
    driveStatus = { connected: true };
    renderAt();

    expect(screen.getByLabelText(/save to google drive/i)).toBeChecked();
  });

  it('keeps "Save to Google Drive" checked by default after a successful upload (edge case)', async () => {
    driveStatus = { connected: true };
    uploadMutateAsync.mockResolvedValue(makeCv({ storageProvider: 'google-drive' }));
    renderAt();

    const file = new File(['pdf-bytes'], 'resume.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/pdf/i), file);
    await userEvent.type(screen.getByLabelText(/label/i), 'Main resume');
    await userEvent.click(screen.getByRole('button', { name: /upload cv/i }));

    expect(await screen.findByLabelText(/save to google drive/i)).toBeChecked();
  });

  it('accepts a .docx file for upload (happy path)', async () => {
    driveStatus = { connected: false };
    uploadMutateAsync.mockResolvedValue(makeCv({}));
    renderAt();

    const file = new File(['docx-bytes'], 'resume.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await userEvent.upload(screen.getByLabelText(/pdf/i), file);
    await userEvent.type(screen.getByLabelText(/label/i), 'Main resume');
    await userEvent.click(screen.getByRole('button', { name: /upload cv/i }));

    expect(uploadMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ file }));
  });

  it('shows a success banner when redirected back with driveConnected=1 (happy path)', () => {
    driveStatus = { connected: true };
    renderAt('/cvs?driveConnected=1');

    expect(screen.getByText(/google drive connected\./i)).toBeInTheDocument();
  });

  it('shows an error banner when redirected back with a driveError (negative case)', () => {
    driveStatus = { connected: false };
    renderAt('/cvs?driveError=denied');

    expect(screen.getByText(/couldn't connect google drive/i)).toBeInTheDocument();
  });

  it('shows no banner on a plain visit with neither query param (negative case)', () => {
    driveStatus = { connected: false };
    renderAt();

    expect(screen.queryByText(/google drive connected\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't connect google drive/i)).not.toBeInTheDocument();
  });

  it('shows a "Drive" badge on a Google Drive-backed CV (happy path)', () => {
    driveStatus = { connected: true };
    cvsData = [makeCv({ storageProvider: 'google-drive' })];
    renderAt();

    expect(screen.getByText('Drive')).toBeInTheDocument();
  });

  it('shows no "Drive" badge on an app-storage CV (negative case)', () => {
    driveStatus = { connected: false };
    cvsData = [makeCv({ storageProvider: 'app' })];
    renderAt();

    expect(screen.queryByText('Drive')).not.toBeInTheDocument();
  });
});

describe('CvsPage — delete confirmation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cvsData = [];
    driveStatus = undefined;
    deleteError = null;
  });

  it('deletes the CV after the user confirms (happy path)', async () => {
    driveStatus = { connected: false };
    cvsData = [makeCv({})];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMutate).toHaveBeenCalledWith('cv-1');
  });

  it('does not delete when the user cancels the confirmation (negative case)', async () => {
    driveStatus = { connected: false };
    cvsData = [makeCv({})];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('shows the server error when deletion is blocked by an attached application (negative case)', () => {
    driveStatus = { connected: false };
    cvsData = [makeCv({})];
    deleteError = { message: 'This CV is attached to an application.' };
    renderAt();

    expect(screen.getByText('This CV is attached to an application.')).toBeInTheDocument();
  });

  it('links to each application referencing the CV in the conflict body (happy path)', () => {
    driveStatus = { connected: false };
    cvsData = [makeCv({})];
    deleteError = {
      message: 'This CV is attached to one or more applications.',
      body: {
        message: 'This CV is attached to one or more applications.',
        applications: [{ id: 'app-1', jobTitle: 'Backend Engineer', company: 'Acme' }],
      },
    };
    renderAt();

    const link = screen.getByRole('link', { name: /backend engineer.*acme/i });
    expect(link).toHaveAttribute('href', '/applications/app-1');
  });
});

describe('CvsPage — open and unattached state', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cvsData = [];
    driveStatus = undefined;
  });

  it('opens the CV when "Open" is clicked (happy path)', async () => {
    driveStatus = { connected: false };
    const cv = makeCv({});
    cvsData = [cv];
    renderAt();

    await userEvent.click(screen.getByRole('button', { name: /^open$/i }));

    expect(openMutate).toHaveBeenCalledWith(cv);
  });

  it('shows an "Unattached" badge and hides "Open" once a Drive file is missing (edge case)', () => {
    driveStatus = { connected: true };
    cvsData = [
      makeCv({ storageProvider: 'google-drive', unattachedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    renderAt();

    expect(screen.getByText(/unattached/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^open$/i })).not.toBeInTheDocument();
    // Deleting a broken record must still work — that's the whole point
    // of surfacing it instead of leaving the user stuck.
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('shows no "Unattached" badge for a normal, still-attached CV (negative case)', () => {
    driveStatus = { connected: true };
    cvsData = [makeCv({ storageProvider: 'google-drive' })];
    renderAt();

    expect(screen.queryByText(/unattached/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^open$/i })).toBeInTheDocument();
  });
});
