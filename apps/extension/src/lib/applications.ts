import type { CreateApplicationInput } from '@bewerber/shared';
import { callApi, callApiAllowQueue } from './messenger';

export interface DuplicateCheck {
  exists: boolean;
  id: string | null;
}

export function checkDuplicate(applyLink: string): Promise<DuplicateCheck> {
  return callApi<DuplicateCheck>(
    `/applications/check-duplicate?applyLink=${encodeURIComponent(applyLink)}`,
  );
}

export type CreateApplicationResult = { status: 'saved'; id: string } | { status: 'queued' };

// Queueable, unlike checkDuplicate above — this is the one call where
// losing the data because the network happened to be down actually
// matters. See background/queue.ts for what happens to a queued save.
export async function createApplication(
  input: CreateApplicationInput,
): Promise<CreateApplicationResult> {
  const result = await callApiAllowQueue<{ _id: string }>('/applications', {
    method: 'POST',
    body: input,
  });
  return result.status === 'saved' ? { status: 'saved', id: result.data._id } : result;
}
