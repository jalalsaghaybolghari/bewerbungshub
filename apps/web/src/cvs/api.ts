import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCvMetadataInput, UpdateCvInput } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';
import type { Cv } from './types';

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
    mutationFn: (input: UpdateCvInput) => apiFetch<Cv>(`/cvs/${id}`, { method: 'PATCH', body: input }),
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
