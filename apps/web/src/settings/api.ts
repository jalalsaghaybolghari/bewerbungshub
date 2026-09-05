import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserSettingsInput, UserSettings } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';
import type { ApiKeyStatus, GeneratedApiKey } from './types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<UserSettings>('/users/me/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserSettingsInput) =>
      apiFetch<UserSettings>('/users/me/settings', { method: 'PATCH', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useApiKeyStatus() {
  return useQuery({
    queryKey: ['settings', 'api-key'],
    queryFn: () => apiFetch<ApiKeyStatus>('/auth/api-key'),
  });
}

// Returns the raw key exactly once — the caller must show it to the user
// immediately, since only its hash is ever persisted server-side.
export function useGenerateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<GeneratedApiKey>('/auth/api-key', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'api-key'] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/api-key', { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings', 'api-key'] }),
  });
}
