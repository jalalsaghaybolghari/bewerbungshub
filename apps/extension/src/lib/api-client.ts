// TODO: point this at the deployed API origin before shipping past dev
// (keep in sync with manifest.config.ts's host_permissions).
const API_BASE = 'http://localhost:3000/api/v1';

// TODO: point this at the deployed web app origin before shipping past dev.
export const WEB_APP_URL = 'http://localhost:5173';

const ACCESS_TOKEN_KEY = 'accessToken';

export async function getAccessToken(): Promise<string | null> {
  const stored = await chrome.storage.session.get(ACCESS_TOKEN_KEY);
  return (stored[ACCESS_TOKEN_KEY] as string | undefined) ?? null;
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token === null) {
    await chrome.storage.session.remove(ACCESS_TOKEN_KEY);
  } else {
    await chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: token });
  }
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

// Relies on the API's httpOnly refresh cookie, shared with the browser's
// regular cookie jar via this extension's host_permissions for API_BASE's
// origin — see PLAN.md's Phase 3 auth decision for why this doesn't need
// its own token storage.
async function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      await setAccessToken(data.accessToken);
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
  skipRefresh?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipRefresh } = options;

  const accessToken = await getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
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

export { refreshAccessToken };
