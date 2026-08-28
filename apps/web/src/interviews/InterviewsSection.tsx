import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createInterviewSchema,
  interviewOutcomeValues,
  interviewTypeValues,
} from '@bewerber/shared';
import type { CreateInterviewInput } from '@bewerber/shared';
import { useCreateInterview, useDeleteInterview, useUpdateInterview } from './api';
import type { Interview } from './types';
import { Button, Card, Input, Label, Select } from '../components/ui';

// z.coerce.date()'s input type is `Date`, but the datetime-local input
// produces a string — override just that field (the runtime coercion
// still accepts a string regardless of this static type).
type FormValues = Omit<z.input<typeof createInterviewSchema>, 'scheduledAt'> & {
  scheduledAt: string;
};

export function InterviewsSection({
  applicationId,
  interviews,
}: {
  applicationId: string;
  interviews: Interview[];
}) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const create = useCreateInterview(applicationId);
  const update = useUpdateInterview(applicationId);
  const remove = useDeleteInterview(applicationId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues, unknown, CreateInterviewInput>({
    // See the FormValues comment above — the resolver's own inferred input
    // type has `scheduledAt: Date`; the runtime coercion accepts our string
    // form value fine, TS just can't verify it across this boundary.
    resolver: zodResolver(createInterviewSchema) as unknown as Resolver<
      FormValues,
      unknown,
      CreateInterviewInput
    >,
    defaultValues: { round: interviews.length + 1, type: 'phone_screen' },
  });

  async function onSubmit(data: CreateInterviewInput) {
    await create.mutateAsync(data);
    reset({ round: interviews.length + 2, type: 'phone_screen' });
    setShowForm(false);
  }

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{t('interviews.title')}</h2>
        <button
          className="text-sm text-teal hover:underline"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t('common.cancel') : t('interviews.schedule')}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="mb-4 space-y-3 rounded-lg border border-slate/15 p-4"
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="round">{t('interviews.round')}</Label>
              <Input id="round" type="number" min={1} {...register('round')} />
            </div>
            <div>
              <Label htmlFor="type">{t('interviews.type')}</Label>
              <Select id="type" {...register('type')}>
                {interviewTypeValues.map((v) => (
                  <option key={v} value={v}>
                    {t(`interviews.types.${v}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="scheduledAt">{t('interviews.scheduledAt')}</Label>
              <Input id="scheduledAt" type="datetime-local" {...register('scheduledAt')} />
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      )}

      {interviews.length === 0 && !showForm && (
        <p className="text-sm text-slate">{t('interviews.empty')}</p>
      )}

      <ul className="space-y-3">
        {interviews.map((interview) => (
          <li
            key={interview._id}
            className="flex items-center justify-between rounded-lg border border-slate/15 p-3"
          >
            <div>
              <div className="text-sm font-semibold text-ink">
                {t('interviews.roundLabel', { round: interview.round })} ·{' '}
                {t(`interviews.types.${interview.type}`)}
              </div>
              <div className="text-xs text-slate">
                {new Date(interview.scheduledAt).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={interview.outcome}
                onChange={(e) =>
                  update.mutate({ id: interview._id, input: { outcome: e.target.value as never } })
                }
                className="w-auto text-xs"
              >
                {interviewOutcomeValues.map((v) => (
                  <option key={v} value={v}>
                    {t(`interviews.outcomes.${v}`)}
                  </option>
                ))}
              </Select>
              <button
                className="text-xs text-danger hover:underline"
                onClick={() => remove.mutate(interview._id)}
              >
                {t('common.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
