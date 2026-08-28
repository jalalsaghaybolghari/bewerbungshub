import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFollowUpInput, UpdateFollowUpInput } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';
import type { FollowUp } from './types';

export function useCreateFollowUp(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) =>
      apiFetch<FollowUp>(`/applications/${applicationId}/follow-ups`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}

export function useUpdateFollowUp(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFollowUpInput }) =>
      apiFetch<FollowUp>(`/follow-ups/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}

export function useDeleteFollowUp(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/follow-ups/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['applications', applicationId] }),
  });
}
