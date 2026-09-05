import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminStats, AdminUsersListResponse, AdminUsersQuery } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';

function toQueryString(query: object): string {
  const params = new URLSearchParams();
  const entries = Object.entries(query) as [string, string | number | boolean | undefined][];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<AdminStats>('/admin/stats'),
  });
}

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: () => apiFetch<AdminUsersListResponse>(`/admin/users${toQueryString(query)}`),
  });
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}
