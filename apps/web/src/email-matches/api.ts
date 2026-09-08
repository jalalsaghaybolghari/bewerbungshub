import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmailMatch, UnmatchedEmailMatch } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';

const QUERY_KEY = ['email-matches', 'pending'];
const UNMATCHED_QUERY_KEY = ['email-matches', 'unmatched'];

export function usePendingEmailMatches() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<EmailMatch[]>('/gmail/pending'),
  });
}

// Only meaningful in manual-approve mode — in auto-approve mode even
// matched emails apply without the user reviewing this page, so an
// "emails we couldn't match" list has nothing useful to add. `enabled`
// lets the page skip the request entirely rather than just hiding the
// result.
export function useUnmatchedEmailMatches(enabled: boolean) {
  return useQuery({
    queryKey: UNMATCHED_QUERY_KEY,
    queryFn: () => apiFetch<UnmatchedEmailMatch[]>('/gmail/unmatched'),
    enabled,
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

export function useRejectUnmatchedEmailMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/gmail/unmatched/${id}/reject`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: UNMATCHED_QUERY_KEY }),
  });
}
