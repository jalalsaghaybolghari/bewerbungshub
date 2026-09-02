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
  DuplicateGroupsResponse,
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
    // Without this, the Kanban board still shows the pre-drag status until
    // the request round-trips — the dropped card visibly snaps back to its
    // old column, then jumps to the new one once the refetch lands. Update
    // the cache immediately instead, and roll back only if the request
    // actually fails. This touches every cached ['applications', ...] list
    // query (the plain list page may also be mounted) — queries whose data
    // isn't a paginated list (e.g. a single application's detail, or stats)
    // have no `.items` and are left untouched.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['applications'] });

      const previous = queryClient.getQueriesData<ApplicationsListResponse>({
        queryKey: ['applications'],
      });

      queryClient.setQueriesData<ApplicationsListResponse>(
        { queryKey: ['applications'] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((app) =>
              app._id === id ? { ...app, status: status as Application['status'] } : app,
            ),
          };
        },
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['applications'] }),
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

export function useDuplicatePairs() {
  return useQuery({
    queryKey: ['applications', 'duplicate-groups'],
    queryFn: () => apiFetch<DuplicateGroupsResponse>('/applications/duplicate-groups'),
  });
}

export function useMergeApplications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keepId, mergeId }: { keepId: string; mergeId: string }) =>
      apiFetch<Application>(`/applications/${keepId}/merge/${mergeId}`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}
