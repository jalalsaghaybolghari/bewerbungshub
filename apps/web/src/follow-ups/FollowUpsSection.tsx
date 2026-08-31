import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createFollowUpSchema, followUpChannelValues } from '@bewerber/shared';
import type { CreateFollowUpInput } from '@bewerber/shared';
import { useCreateFollowUp, useDeleteFollowUp, useUpdateFollowUp } from './api';
import type { FollowUp } from './types';
import { Button, Card, Input, Label, Select } from '../components/ui';

// z.coerce.date()'s input type is `Date`, but the datetime-local input
// produces a string — override just that field (the runtime coercion
// still accepts a string regardless of this static type).
type FormValues = Omit<z.input<typeof createFollowUpSchema>, 'dueAt'> & { dueAt: string };

function defaultDueAt(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

export function FollowUpsSection({
  applicationId,
  followUps,
}: {
  applicationId: string;
  followUps: FollowUp[];
}) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const create = useCreateFollowUp(applicationId);
  const update = useUpdateFollowUp(applicationId);
  const remove = useDeleteFollowUp(applicationId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues, unknown, CreateFollowUpInput>({
    // The resolver's own inferred input type has `dueAt: Date` (see the
    // FormValues comment above); the runtime coercion accepts our string
    // form value fine, TS just can't verify it across this boundary.
    resolver: zodResolver(createFollowUpSchema) as unknown as Resolver<
      FormValues,
      unknown,
      CreateFollowUpInput
    >,
    defaultValues: { channel: 'email', dueAt: defaultDueAt() },
  });

  async function onSubmit(data: CreateFollowUpInput) {
    await create.mutateAsync(data);
    reset({ channel: 'email', dueAt: defaultDueAt() });
    setShowForm(false);
  }

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('followUps.title')}</h2>
        <button
          className="text-sm text-accent hover:underline"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t('common.cancel') : t('followUps.schedule')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="mb-4 space-y-3 rounded-lg border border-slate/15 p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dueAt">{t('followUps.dueAt')}</Label>
              <Input id="dueAt" type="datetime-local" {...register('dueAt')} />
            </div>
            <div>
              <Label htmlFor="channel">{t('followUps.channel')}</Label>
              <Select id="channel" {...register('channel')}>
                {followUpChannelValues.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      )}

      {followUps.length === 0 && !showForm && (
        <p className="text-sm text-slate">{t('followUps.empty')}</p>
      )}

      <ul className="space-y-3">
        {followUps.map((followUp) => {
          const isOverdue =
            followUp.status === 'scheduled' && new Date(followUp.dueAt) < new Date();
          return (
            <li
              key={followUp._id}
              className="flex items-center justify-between rounded-lg border border-slate/15 p-3"
            >
              <div>
                <div className={`text-sm font-semibold ${isOverdue ? 'text-amber' : 'text-ink'}`}>
                  {new Date(followUp.dueAt).toLocaleString()} · {followUp.channel}
                  {isOverdue && ` · ${t('followUps.overdue')}`}
                </div>
                <div className="text-xs text-slate">{t(`followUps.status.${followUp.status}`)}</div>
              </div>
              <div className="flex items-center gap-3">
                {followUp.status === 'scheduled' && (
                  <button
                    className="text-xs text-accent hover:underline"
                    onClick={() => update.mutate({ id: followUp._id, input: { status: 'sent' } })}
                  >
                    {t('followUps.markSent')}
                  </button>
                )}
                <button
                  className="text-xs text-danger hover:underline"
                  onClick={() => remove.mutate(followUp._id)}
                >
                  {t('common.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
