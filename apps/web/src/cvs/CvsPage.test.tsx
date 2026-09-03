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
const updateMutate = vi.fn();
const disconnectMutate = vi.fn();
const connectGoogleDriveMock = vi.fn();

vi.mock('./api', () => ({
  useCvs: () => ({ data: cvsData, isLoading: false }),
  useUploadCv: () => ({ mutateAsync: uploadMutateAsync, error: null, isPending: false }),
  useDeleteCv: () => ({ mutate: deleteMutate }),
  useUpdateCv: () => ({ mutate: updateMutate }),
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
