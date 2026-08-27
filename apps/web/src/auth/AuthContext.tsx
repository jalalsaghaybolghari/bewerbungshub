import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser, LoginInput, RegisterInput } from '@bewerber/shared';
import { apiFetch, refreshAccessToken, setAccessToken } from '../lib/api-client';

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          const me = await apiFetch<AuthUser>('/auth/me');
          setUser(me);
        } catch {
          setUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function login(input: LoginInput) {
    const res = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }

  async function register(input: RegisterInput) {
    const res = await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: input });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
