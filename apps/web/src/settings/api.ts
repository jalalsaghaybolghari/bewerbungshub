import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserSettingsInput, UserSettings } from '@bewerber/shared';
import { apiFetch } from '../lib/api-client';

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
