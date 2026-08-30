import { useEffect, useState } from 'react';
import type { AuthUser, LoginInput } from '@bewerber/shared';
import { callApi } from './messenger';

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

// Caching the access token (background/index.ts's onMessage listener,
// keyed off this exact path) and clearing it on logout both happen in the
// background now, not here — this context (injected into the host page)
// can't reach chrome.storage.session, which deliberately excludes
// content-script contexts by default.
export async function login(input: LoginInput): Promise<AuthUser> {
  const res = await callApi<AuthResponse>('/auth/login', { method: 'POST', body: input });
  return res.user;
}

export async function logout(): Promise<void> {
  await callApi('/auth/logout', { method: 'POST' });
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
}

// Mirrors apps/web's AuthContext "refresh on mount" pattern: every widget
// mount is a fresh mount (re-injected from scratch on each toolbar click —
// nothing persists in this context between opens), so silently try the
// cookie-backed refresh before falling back to the login view. The actual
// refresh call happens transparently inside background/api.ts's apiFetch
// whenever a request 401s — /auth/me here is really just "is there a valid
// session at all," triggering that refresh path on the very first call.
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let user: AuthUser | null = null;
      try {
        user = await callApi<AuthUser>('/auth/me');
      } catch {
        user = null;
      }
      if (!cancelled) setState({ user, isLoading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
