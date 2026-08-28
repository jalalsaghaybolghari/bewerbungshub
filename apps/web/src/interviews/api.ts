import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateInterviewInput, UpdateInterviewInput } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';
import type { Interview } from './types';

export function useCreateInterview(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInterviewInput) =>
      apiFetch<Interview>(`/applications/${applicationId}/interviews`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}

export function useUpdateInterview(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInterviewInput }) =>
      apiFetch<Interview>(`/interviews/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}

export function useDeleteInterview(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/interviews/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}
