import { useState } from 'react';
import type { ExtractedJobPosting } from '@bewerber/scrapers';
import type { AuthUser } from '@bewerber/shared';
import { useAuthState, logout } from '../lib/auth';
import { WEB_APP_URL } from '../lib/api-client';
import { LoginView } from './LoginView';
import { CaptureView } from './CaptureView';

// The floating card itself — replaces the old popup's App.tsx shell.
// Fixed-position, high z-index (max signed 32-bit int, the standard trick
// for sitting above whatever stacking context the host page has) since
// this renders inside a shadow root injected into an arbitrary page.
export function Widget({
  url,
  extraction,
  extractionError,
  onClose,
}: {
  url: string;
  extraction?: ExtractedJobPosting;
  extractionError?: string;
  onClose: () => void;
}) {
  const { user: refreshedUser, isLoading } = useAuthState();
  // undefined = defer to the refresh-on-mount result; null/AuthUser = an
  // explicit login/logout that happened after mount, which should win.
  const [override, setOverride] = useState<AuthUser | null | undefined>(undefined);
  const user = override !== undefined ? override : refreshedUser;

  return (
    <div className="fixed bottom-4 right-4 z-[2147483647] w-96 overflow-hidden rounded-2xl border border-slate/15 bg-paper shadow-xl">
      <div className="flex items-center justify-between bg-ink px-4 py-3">
        <a
          href={`${WEB_APP_URL}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold text-white hover:text-teal"
        >
          Bewerbermanagementsystem
        </a>
        <div className="flex items-center gap-3">
          {user && (
            <button
              className="text-xs text-white/70 hover:text-white"
              onClick={() => void logout().then(() => setOverride(null))}
            >
              Log out
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            className="text-white/70 hover:text-white"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-slate">Loading…</p>
        ) : !user ? (
          <LoginView onLoggedIn={setOverride} />
        ) : (
          <CaptureView url={url} extraction={extraction} error={extractionError} />
        )}
      </div>
    </div>
  );
}
