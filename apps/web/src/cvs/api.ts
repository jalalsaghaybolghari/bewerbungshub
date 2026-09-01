import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCvMetadataInput, UpdateCvInput } from '@bewerber/shared';
import { apiFetch, apiFetchBlob } from '../lib/api-client';
import type { Cv } from './types';

// The file endpoint requires the same Bearer-token auth as everything
// else apiFetch calls — a plain <a href> can't attach that header, so
// the file has to be fetched as a blob and opened via an object URL.
// Revoked after a delay rather than immediately: revoking synchronously
// races the new tab's load, which can leave it blank in some browsers.
export async function openCvFile(id: string): Promise<void> {
  const blob = await apiFetchBlob(`/cvs/${id}/file`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/cvs/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cvs'] }),
  });
}
