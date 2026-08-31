import { apiFetch } from './api';
import { ApiError } from '../lib/api-client';

// chrome.storage.local, not .session: this needs to survive a browser
// restart (the whole point of queueing is "try again later," and "later"
// might be after the user closes and reopens Chrome), unlike the access
// token in background/api.ts, which is deliberately session-scoped.
const QUEUE_KEY = 'offlineQueue';

export interface QueuedRequest {
  path: string;
  method: string;
  body: unknown;
  queuedAt: string;
}

async function getQueue(): Promise<QueuedRequest[]> {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  return (stored[QUEUE_KEY] as QueuedRequest[] | undefined) ?? [];
}

async function setQueue(queue: QueuedRequest[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

export async function enqueue(path: string, method: string, body: unknown): Promise<void> {
  const queue = await getQueue();
  queue.push({ path, method, body, queuedAt: new Date().toISOString() });
  await setQueue(queue);
}

function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError);
}

// Attempts each queued request in order via the same apiFetch every other
// call goes through. Stops at the first one that still fails on a network
// error — if the connection dropped again mid-flush, there's no point
// trying the rest, and it preserves original queue order for next time.
// A request that fails with a real ApiError (e.g. a validation error) is
// dropped instead of kept: the payload was already invalid when it was
// queued, and retrying it forever would never succeed.
export async function flushQueue(): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  const remaining: QueuedRequest[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await apiFetch(item.path, { method: item.method, body: item.body });
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(...queue.slice(i));
        break;
      }
      // A real ApiError — drop this one, keep processing the rest.
    }
  }
  await setQueue(remaining);
}
