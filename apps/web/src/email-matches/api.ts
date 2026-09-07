import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmailMatch } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';

const QUERY_KEY = ['email-matches', 'pending'];

export function usePendingEmailMatches() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<EmailMatch[]>('/gmail/pending'),
  });
}

export function useApproveEmailMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/gmail/pending/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useRejectEmailMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/gmail/pending/${id}/reject`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
