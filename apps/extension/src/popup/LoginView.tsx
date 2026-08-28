import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@bewerber/shared';
import { login } from '../lib/auth';
import { ApiError } from '../lib/api-client';
import { Button, FieldError, Input, Label } from '../components/ui';
import type { AuthUser } from '@bewerber/shared';

export function LoginView({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(input: LoginInput) {
    setServerError(null);
    try {
      const user = await login(input);
      onLoggedIn(user);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-lg font-bold text-ink">Bewerbermanagementsystem</h1>
      <p className="mb-4 text-sm text-slate">Log in to capture this job posting.</p>
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...register('password')} />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        {serverError && <p className="text-sm text-danger">{serverError}</p>}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>
    </div>
  );
}
