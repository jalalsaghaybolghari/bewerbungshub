import { ApiError } from './api-client';

interface RequestOptions {
  method?: string;
  body?: unknown;
}

type ApiErrorShape = { status: number; message: string; body?: unknown };
type ApiResponse<T> = { ok: true; data: T } | ({ ok: false } & ApiErrorShape);
type QueueableApiResponse<T> = ApiResponse<T> | { queued: true };

// The widget-side counterpart to background/api.ts's apiFetch — same call
// signature, so lib/auth.ts and lib/applications.ts barely change. A plain
// Error subclass like ApiError doesn't reliably survive
// chrome.runtime.sendMessage's structured clone (its `name` gets flattened
// away, same loss category as a Date not surviving
// chrome.scripting.executeScript's result serialization), so the background
// sends a plain object across and this reconstructs a real ApiError from it
// on the way back — keeping every `err instanceof ApiError` check in
// LoginView.tsx/CaptureForm.tsx working unmodified.
export async function callApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = (await chrome.runtime.sendMessage({
    type: 'API_FETCH',
    path,
    method: options.method,
    body: options.body,
  })) as ApiResponse<T>;

  if (!response.ok) {
    throw new ApiError(response.status, response.message, response.body);
  }
  return response.data;
}

export type QueueableResult<T> = { status: 'saved'; data: T } | { status: 'queued' };

// Only for the one call site where losing the data actually matters
// (createApplication, see lib/applications.ts) — see background/index.ts's
// queueOnNetworkFailure handling for what actually decides to queue.
export async function callApiAllowQueue<T>(
  path: string,
  options: RequestOptions = {},
): Promise<QueueableResult<T>> {
  const response = (await chrome.runtime.sendMessage({
    type: 'API_FETCH',
    path,
    method: options.method,
    body: options.body,
    queueOnNetworkFailure: true,
  })) as QueueableApiResponse<T>;

  if ('queued' in response) return { status: 'queued' };
  if (!response.ok) {
    throw new ApiError(response.status, response.message, response.body);
  }
  return { status: 'saved', data: response.data };
}
