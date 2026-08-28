import { useEffect, useState } from 'react';
import type { AuthUser, LoginInput } from '@bewerber/shared';
import { apiFetch, refreshAccessToken, setAccessToken } from './api-client';

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const res = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input });
  await setAccessToken(res.accessToken);
  return res.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    await setAccessToken(null);
  }
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
}

// Mirrors apps/web's AuthContext "refresh on mount" pattern: every popup
// open is a fresh mount (MV3 popups don't stay alive between opens), so
// silently try the cookie-backed refresh before falling back to the login
// view.
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refreshed = await refreshAccessToken();
      let user: AuthUser | null = null;
      if (refreshed) {
        try {
          user = await apiFetch<AuthUser>('/auth/me');
        } catch {
          user = null;
        }
      }
      if (!cancelled) setState({ user, isLoading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
