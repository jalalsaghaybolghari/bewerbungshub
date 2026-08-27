import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginInput } from '@bewerber/shared';
import { useAuth } from './AuthContext';
import { Button, FieldError, Input, Label } from '../components/ui';
import { ApiError } from '../lib/api-client';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    try {
      await login(data);
      navigate('/applications');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.loginError'));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        className="w-full max-w-sm rounded-xl border border-slate/15 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-bold text-ink">{t('auth.login')}</h1>

        <div className="mb-4">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <div className="mb-6">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
          <FieldError>{errors.password?.message}</FieldError>
        </div>

        {serverError && <p className="mb-4 text-sm text-danger">{serverError}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {t('auth.login')}
        </Button>

        <p className="mt-4 text-center text-xs text-slate">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-teal">
            {t('auth.register')}
          </Link>
        </p>
      </form>
    </div>
  );
}
