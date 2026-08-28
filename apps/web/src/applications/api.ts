import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeApplicationStatusInput,
  CreateApplicationInput,
  UpdateApplicationInput,
} from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';
import type {
  Application,
  ApplicationDetailResponse,
  ApplicationsListResponse,
  ApplicationStats,
} from './types';

export interface ApplicationsQuery {
  status?: string;
  applyType?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

function toQueryString(query: ApplicationsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useApplications(query: ApplicationsQuery) {
  return useQuery({
    queryKey: ['applications', query],
    queryFn: () => apiFetch<ApplicationsListResponse>(`/applications${toQueryString(query)}`),
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ['applications', id],
    queryFn: () => apiFetch<ApplicationDetailResponse>(`/applications/${id}`),
    enabled: !!id,
  });
}

export function useApplicationStats() {
  return useQuery({
    queryKey: ['applications', 'stats'],
    queryFn: () => apiFetch<ApplicationStats>('/applications/stats'),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApplicationInput) =>
      apiFetch<Application>('/applications', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateApplicationInput) =>
      apiFetch<Application>(`/applications/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useMoveApplicationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<Application>(`/applications/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export function useChangeApplicationStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeApplicationStatusInput) =>
      apiFetch<Application>(`/applications/${id}/status`, { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/applications/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}
