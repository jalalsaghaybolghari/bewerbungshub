import type { CreateApplicationInput } from '@bewerber/shared';
import { apiFetch } from './api-client';

export interface DuplicateCheck {
  exists: boolean;
  id: string | null;
}

export function checkDuplicate(applyLink: string): Promise<DuplicateCheck> {
  return apiFetch<DuplicateCheck>(
    `/applications/check-duplicate?applyLink=${encodeURIComponent(applyLink)}`,
  );
}

export function createApplication(input: CreateApplicationInput): Promise<{ _id: string }> {
  return apiFetch<{ _id: string }>('/applications', { method: 'POST', body: input });
}
