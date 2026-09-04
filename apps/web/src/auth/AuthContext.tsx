import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  AuthUser,
  ConfirmEmailInput,
  LoginInput,
  RegisterInput,
  ResendCodeInput,
} from '@bewerber/shared';
import { apiFetch, refreshAccessToken, setAccessToken } from '../lib/api-client';

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  // Doesn't log the user in — an unverified account has no session until
  // confirmEmail succeeds. Resolves with the email to carry into the
  // verify-email step (the caller already has it too, but this keeps the
  // page from needing to remember it separately).
  register: (input: RegisterInput) => Promise<{ email: string }>;
  confirmEmail: (input: ConfirmEmailInput) => Promise<void>;
  resendCode: (input: ResendCodeInput) => Promise<void>;
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
    return apiFetch<{ email: string }>('/auth/register', { method: 'POST', body: input });
  }

  async function confirmEmail(input: ConfirmEmailInput) {
    const res = await apiFetch<AuthResponse>('/auth/confirm-email', {
      method: 'POST',
      body: input,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }

  async function resendCode(input: ResendCodeInput) {
    await apiFetch<void>('/auth/resend-code', { method: 'POST', body: input });
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
    <AuthContext.Provider
      value={{ user, isLoading, login, register, confirmEmail, resendCode, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
