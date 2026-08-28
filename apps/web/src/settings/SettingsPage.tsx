import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { updateUserSettingsSchema } from '@bewerber/shared';
import type { UpdateUserSettingsInput } from '@bewerber/shared';
import { useSettings, useUpdateSettings } from './api';
import { Button, Card, FieldError, Input, Label } from '../components/ui';

// z.coerce.number()'s input type doesn't match the string a number
// <input> produces — override both fields (the runtime coercion still
// accepts a string regardless of this static type).
type FormValues = Omit<
  z.input<typeof updateUserSettingsSchema>,
  'followUpDefaultDays' | 'ghostedAfterDays'
> & {
  followUpDefaultDays: string;
  ghostedAfterDays: string;
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, UpdateUserSettingsInput>({
    // See the FormValues comment above — the resolver's own inferred input
    // type doesn't match our string form values, TS just can't verify it
    // across this boundary.
    resolver: zodResolver(updateUserSettingsSchema) as unknown as Resolver<
      FormValues,
      unknown,
      UpdateUserSettingsInput
    >,
  });

  useEffect(() => {
    if (settings) {
      reset({
        followUpDefaultDays: String(settings.followUpDefaultDays),
        ghostedAfterDays: String(settings.ghostedAfterDays),
      });
    }
  }, [settings, reset]);

  async function onSubmit(data: UpdateUserSettingsInput) {
    await update.mutateAsync(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (isLoading) return <p className="text-slate">{t('common.loading')}</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('settings.title')}</h1>

      <Card>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div>
            <Label htmlFor="followUpDefaultDays">{t('settings.followUpDefaultDays')}</Label>
            <Input
              id="followUpDefaultDays"
              type="number"
              min={1}
              max={90}
              {...register('followUpDefaultDays')}
            />
            <FieldError>{errors.followUpDefaultDays?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="ghostedAfterDays">{t('settings.ghostedAfterDays')}</Label>
            <Input
              id="ghostedAfterDays"
              type="number"
              min={1}
              max={365}
              {...register('ghostedAfterDays')}
            />
            <FieldError>{errors.ghostedAfterDays?.message}</FieldError>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {t('common.save')}
            </Button>
            {saved && <span className="text-sm text-teal">{t('settings.saved')}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
