// This module only ever runs in the background service worker — a real
// extension context with no host-page CSP/CORS applied, and the only
// context chrome.storage.session's default TRUSTED_CONTEXTS access level
// permits. The widget (a script injected into an arbitrary host page like
// LinkedIn) cannot call fetch() against the API directly: since Chrome 73,
// fetch/XHR from a content script are attributed to the page's own origin,
// not the extension's, so they get none of host_permissions' cross-origin
// allowance and would be blocked by the API's CORS policy. It talks to this
// module instead via chrome.runtime.sendMessage (see background/index.ts
// and lib/messenger.ts).

import { ApiError } from '../lib/api-client';

// TODO: point this at the deployed API origin before shipping past dev
// (keep in sync with manifest.config.ts's host_permissions).
const API_BASE = 'http://localhost:3000/api/v1';

const ACCESS_TOKEN_KEY = 'accessToken';

async function getAccessToken(): Promise<string | null> {
  const stored = await chrome.storage.session.get(ACCESS_TOKEN_KEY);
  return (stored[ACCESS_TOKEN_KEY] as string | undefined) ?? null;
}

async function setAccessToken(token: string | null): Promise<void> {
  if (token === null) {
    await chrome.storage.session.remove(ACCESS_TOKEN_KEY);
  } else {
    await chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: token });
  }
}

let refreshPromise: Promise<boolean> | null = null;

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

export { setAccessToken };
