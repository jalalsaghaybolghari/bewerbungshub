const API_BASE = '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Coalesce concurrent 401s into a single refresh call.
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
  skipRefresh?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData, skipRefresh } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
  }

  if (!res.ok) {
    let parsedBody: unknown;
    try {
      parsedBody = await res.json();
    } catch {
      // no JSON body
    }
    const message =
      (parsedBody && typeof parsedBody === 'object' && 'message' in parsedBody
        ? String((parsedBody as { message: unknown }).message)
        : undefined) ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, parsedBody);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Only endpoint that isn't JSON in/out (CV file download). Mirrors
// apiFetch's auth/refresh handling instead of extending apiFetch itself,
// since forcing a `res.json()` vs `res.blob()` branch through one
// generic function for a single caller isn't worth the added complexity.
export async function apiFetchBlob(path: string, skipRefresh = false): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' });

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetchBlob(path, true);
  }

  if (!res.ok) throw new ApiError(res.status, `Request failed with status ${res.status}`);
  return res.blob();
}

export { refreshAccessToken };
