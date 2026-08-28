import { useState } from 'react';
import type { AuthUser } from '@bewerber/shared';
import { useAuthState, logout } from '../lib/auth';
import { LoginView } from './LoginView';
import { CaptureView } from './CaptureView';

export function App() {
  const { user: refreshedUser, isLoading } = useAuthState();
  // undefined = defer to the refresh-on-mount result; null/AuthUser = an
  // explicit login/logout that happened after mount, which should win.
  const [override, setOverride] = useState<AuthUser | null | undefined>(undefined);
  const user = override !== undefined ? override : refreshedUser;

  if (isLoading) {
    return <p className="p-4 text-sm text-slate">Loading…</p>;
  }

  if (!user) {
    return <LoginView onLoggedIn={setOverride} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate/15 px-4 py-2">
        <h1 className="text-sm font-bold text-ink">Bewerbermanagementsystem</h1>
        <button
          className="text-xs text-slate hover:text-ink"
          onClick={() => void logout().then(() => setOverride(null))}
        >
          Log out
        </button>
      </div>
      <CaptureView />
    </div>
  );
}
