import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCvMetadataInput, UpdateCvInput } from '@bewerber/shared';
import { apiFetch, apiFetchBlob, ApiError } from '../lib/api-client';
import type { Cv, GoogleDriveStatus } from './types';

// A Drive-backed CV opens in Google Drive's own viewer/editor (handles
// docx natively, unlike a raw blob tab) — the API only hands back the
// URL (a normal Bearer-authenticated JSON request), and *that* URL is
// then opened as its own separate, unauthenticated navigation, since
// Drive's viewer has nothing to do with this app's auth.
//
// An app-storage CV has no such external viewer, so it keeps the
// original approach: the file endpoint needs the same Bearer-token auth
// as everything else apiFetch calls, which a plain <a href> can't
// attach, so it's fetched as a blob and opened via an object URL.
// Revoked after a delay rather than immediately: revoking synchronously
// races the new tab's load, which can leave it blank in some browsers.
export async function openCvFile(cv: Pick<Cv, '_id' | 'storageProvider'>): Promise<void> {
  if (cv.storageProvider === 'google-drive') {
    const { url } = await apiFetch<{ url: string }>(`/cvs/${cv._id}/view-url`);
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const blob = await apiFetchBlob(`/cvs/${cv._id}/file`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useOpenCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: openCvFile,
    // A failed open commonly means the API just detected (and persisted)
    // that a Drive-backed file is gone — refetch so the "unattached"
    // badge shows up immediately, without a manual page reload.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['cvs'] }),
  });
}

export function useCvs() {
  return useQuery({
    queryKey: ['cvs'],
    queryFn: () => apiFetch<Cv[]>('/cvs'),
  });
}

export function useUploadCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: CreateCvMetadataInput }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('label', metadata.label);
      formData.append('language', metadata.language);
      if (metadata.isDefault) formData.append('isDefault', 'true');
      if (metadata.useGoogleDrive) formData.append('useGoogleDrive', 'true');
      return apiFetch<Cv>('/cvs', { method: 'POST', body: formData, isFormData: true });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cvs'] }),
  });
}

export function useUpdateCv(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCvInput) =>
      apiFetch<Cv>(`/cvs/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cvs'] }),
  });
}

export function useDeleteCv() {
  const queryClient = useQueryClient();
  // Typed against ApiError (not the default Error) so a blocked deletion's
  // 409 body — { message, applications } — is readable via error.body,
  // letting the UI link to the application(s) still holding the CV.
  return useMutation<void, ApiError, string>({
    mutationFn: (id: string) => apiFetch<void>(`/cvs/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cvs'] }),
  });
}

export function useGoogleDriveStatus() {
  return useQuery({
    queryKey: ['cvs', 'google-drive-status'],
    queryFn: () => apiFetch<GoogleDriveStatus>('/google-drive/status'),
  });
}

// Not a mutation — it never resolves in the normal sense, since a
// successful call ends with the page navigating away entirely to Google's
// consent screen. The API call itself (fetching the signed connect URL)
// is the only part that needs the usual Bearer-authenticated apiFetch;
// the actual redirect is a plain browser navigation.
export async function connectGoogleDrive(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>('/google-drive/connect-url');
  window.location.href = url;
}

export function useDisconnectGoogleDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/google-drive/disconnect', { method: 'DELETE' }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['cvs', 'google-drive-status'] }),
  });
}
