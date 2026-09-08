import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openCvFile, useDisconnectGoogleDrive, useGoogleDriveStatus, useUploadCv } from './api';
import type { Cv, GoogleDriveStatus } from './types';

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeCv(overrides: Partial<Cv> = {}): Cv {
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

function renderWithClient<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHook(hook, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useUploadCv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the file, label, and language in the upload request (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCv()));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderWithClient(() => useUploadCv());
    const file = new File(['pdf-bytes'], 'resume.pdf', { type: 'application/pdf' });

    result.current.mutate({
      file,
      metadata: { label: 'Main resume', language: 'en', isDefault: false, useGoogleDrive: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get('label')).toBe('Main resume');
    expect(body.get('language')).toBe('en');
  });

  it('includes useGoogleDrive in the request when the checkbox is checked (edge case)', async () => {
    // Regression test: this flag was added to the UI and the shared schema
    // but never wired into the FormData actually sent to the API, so
    // checking "Save to Google Drive" silently had no effect.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeCv({ storageProvider: 'google-drive' })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderWithClient(() => useUploadCv());
    const file = new File(['pdf-bytes'], 'resume.pdf', { type: 'application/pdf' });

    result.current.mutate({
      file,
      metadata: { label: 'Main resume', language: 'en', isDefault: false, useGoogleDrive: true },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get('useGoogleDrive')).toBe('true');
  });

  it('omits useGoogleDrive from the request when unchecked (negative case)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCv()));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderWithClient(() => useUploadCv());
    const file = new File(['pdf-bytes'], 'resume.pdf', { type: 'application/pdf' });

    result.current.mutate({
      file,
      metadata: { label: 'Main resume', language: 'en', isDefault: false, useGoogleDrive: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get('useGoogleDrive')).toBeNull();
  });
});

describe('openCvFile', () => {
  const windowOpenMock = vi.fn();

  beforeEach(() => {
    window.open = windowOpenMock;
    // jsdom doesn't implement these — stubbed just enough for the
    // app-storage blob-open branch to run without throwing.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches a view URL and opens it directly for a Drive-backed CV, without downloading a blob (happy path)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ url: 'https://drive.google.com/file/d/abc/view' }));
    vi.stubGlobal('fetch', fetchMock);

    await openCvFile({ _id: 'cv-1', storageProvider: 'google-drive' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/cvs/cv-1/view-url'),
      expect.anything(),
    );
    expect(windowOpenMock).toHaveBeenCalledWith(
      'https://drive.google.com/file/d/abc/view',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('downloads and opens a blob for an app-storage CV (happy path)', async () => {
    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await openCvFile({ _id: 'cv-1', storageProvider: 'app' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/cvs/cv-1/file'),
      expect.anything(),
    );
    expect(windowOpenMock).toHaveBeenCalledWith('blob:mock-url', '_blank', 'noopener,noreferrer');
  });
});

describe('useGoogleDriveStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the Google Drive connection status (happy path)', async () => {
    const status: GoogleDriveStatus = { connected: true, connectedAt: '2026-01-01T00:00:00.000Z' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderWithClient(() => useGoogleDriveStatus());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/google-drive/status'),
      expect.anything(),
    );
  });
});

describe('useDisconnectGoogleDrive', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a DELETE to the disconnect endpoint (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(undefined, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderWithClient(() => useDisconnectGoogleDrive());

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/google-drive/disconnect'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
