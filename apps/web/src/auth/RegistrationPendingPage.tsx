import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function RegistrationPendingPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="w-full max-w-sm rounded-xl border border-slate/15 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-bold text-ink">{t('auth.registrationPending.title')}</h1>
        <p className="mb-6 text-sm text-slate">
          {email
            ? t('auth.registrationPending.bodyWithEmail', { email })
            : t('auth.registrationPending.body')}
        </p>

        <p className="text-center text-xs text-slate">
          <Link to="/login" className="font-semibold text-accent">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
