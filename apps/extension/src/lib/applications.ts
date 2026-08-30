import type { CreateApplicationInput } from '@bewerber/shared';
import { callApi } from './messenger';

export interface DuplicateCheck {
  exists: boolean;
  id: string | null;
}

export function checkDuplicate(applyLink: string): Promise<DuplicateCheck> {
  return callApi<DuplicateCheck>(
    `/applications/check-duplicate?applyLink=${encodeURIComponent(applyLink)}`,
  );
}

export function createApplication(input: CreateApplicationInput): Promise<{ _id: string }> {
  return callApi<{ _id: string }>('/applications', { method: 'POST', body: input });
}
