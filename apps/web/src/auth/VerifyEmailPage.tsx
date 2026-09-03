import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmEmailSchema, type ConfirmEmailInput } from '@bewerber/shared';
import { useAuth } from './AuthContext';
import { Button, FieldError, Input, Label } from '../components/ui';
import { ApiError } from '../lib/api-client';

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { confirmEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  // Starts at the full cooldown, not 0 — register() already sent the
  // first code, so an immediate resend would just be a wasted request.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmEmailInput>({
    resolver: zodResolver(confirmEmailSchema),
    defaultValues: { email: (location.state as { email?: string } | null)?.email ?? '', code: '' },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function onSubmit(data: ConfirmEmailInput) {
    setServerError(null);
    try {
      await confirmEmail(data);
      navigate('/applications');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.verifyEmail.error'));
    }
  }

  async function onResend() {
    setServerError(null);
    setResendMessage(null);
    setIsResending(true);
    try {
      await resendCode({ email: getValues('email') });
      setResendMessage(t('auth.verifyEmail.resent'));
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.verifyEmail.error'));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        className="w-full max-w-sm rounded-xl border border-slate/15 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-2 text-xl font-bold text-ink">{t('auth.verifyEmail.title')}</h1>
        <p className="mb-6 text-sm text-slate">{t('auth.verifyEmail.checkInbox')}</p>

        <div className="mb-4">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <div className="mb-6">
          <Label htmlFor="code">{t('auth.verifyEmail.codeLabel')}</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...register('code')}
          />
          <FieldError>{errors.code?.message}</FieldError>
        </div>

        {serverError && <p className="mb-4 text-sm text-danger">{serverError}</p>}
        {resendMessage && <p className="mb-4 text-sm text-success">{resendMessage}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {t('auth.verifyEmail.verify')}
        </Button>

        <p className="mt-4 text-center text-xs text-slate">
          {cooldown > 0 ? (
            t('auth.verifyEmail.resendCooldown', { seconds: cooldown })
          ) : (
            <button
              type="button"
              onClick={() => void onResend()}
              disabled={isResending}
              className="font-semibold text-accent disabled:opacity-50"
            >
              {t('auth.verifyEmail.resend')}
            </button>
          )}
        </p>

        <p className="mt-4 text-center text-xs text-slate">
          <Link to="/login" className="font-semibold text-accent">
            {t('auth.login')}
          </Link>
        </p>
      </form>
    </div>
  );
}
