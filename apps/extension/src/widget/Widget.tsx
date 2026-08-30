import { useState } from 'react';
import type { ExtractedJobPosting } from '@bewerber/scrapers';
import type { AuthUser } from '@bewerber/shared';
import { useAuthState, logout } from '../lib/auth';
import { WEB_APP_URL } from '../lib/api-client';
import { LoginView } from './LoginView';
import { CaptureView } from './CaptureView';

// A full-height panel docked to the right edge of the viewport — replaces
// the old popup's App.tsx shell. Fixed-position, high z-index (max signed
// 32-bit int, the standard trick for sitting above whatever stacking
// context the host page has) since this renders inside a shadow root
// injected into an arbitrary page.
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
    <div className="fixed inset-y-0 right-0 z-[2147483647] flex w-96 flex-col overflow-hidden border-l border-white/40 bg-paper/75 shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/30 px-4 py-3">
        <a
          href={`${WEB_APP_URL}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-ink hover:text-teal"
        >
          Bewerbermanagementsystem
        </a>
        <div className="flex items-center gap-3">
          {user && (
            <button
              className="text-xs text-slate hover:text-ink"
              onClick={() => void logout().then(() => setOverride(null))}
            >
              Log out
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate hover:bg-white/50 hover:text-ink"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
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
