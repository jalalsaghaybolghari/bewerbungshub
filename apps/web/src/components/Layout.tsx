import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useGmailStatus } from '../settings/api';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
    isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/70 hover:text-white'
  }`;

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: gmailStatus } = useGmailStatus();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-shrink-0 flex-col bg-gradient-to-b from-ink-top to-ink-bottom p-4 text-white">
        <div className="mb-8 px-2 text-lg font-bold tracking-tight">{t('app.name')}</div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/applications" className={navLinkClass}>
            {t('nav.applications')}
          </NavLink>
          <NavLink to="/cvs" className={navLinkClass}>
            {t('nav.cvs')}
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>
            {t('nav.dashboard')}
          </NavLink>
          {gmailStatus?.connected && (
            <NavLink to="/email-matches" className={navLinkClass}>
              {t('nav.emailMatches')}
            </NavLink>
          )}
          <NavLink to="/settings" className={navLinkClass}>
            {t('nav.settings')}
          </NavLink>
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4 text-xs text-white/60">
          <div className="mb-2 truncate">{user?.email}</div>
          <button onClick={() => void logout()} className="text-white/70 hover:text-white">
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
