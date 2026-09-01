import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  applyTypeValues,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@bewerber/shared';
import { useApplication, useCreateApplication, useUpdateApplication } from './api';
import { useCvs } from '../cvs/api';
import { Button, FieldError, Input, Label, Select, Textarea } from '../components/ui';
import { CopyableUrlField } from '../components/CopyableUrlField';

// react-hook-form's form state is the schema's *input* shape (before Zod
// applies `.default()`), not the `CreateApplicationInput` output type.
type ApplicationFormValues = z.input<typeof createApplicationSchema>;

export function ApplicationFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { data: detail } = useApplication(id);
  const { data: cvs } = useCvs();
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication(id ?? '');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues, unknown, CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: { applyType: 'website', tags: [] },
  });

  useEffect(() => {
    if (detail) {
      reset({
        jobTitle: detail.application.jobTitle,
        company: detail.application.company,
        location: detail.application.location,
        jobDescription: detail.application.jobDescription,
        applyLink: detail.application.applyLink,
        applyType: detail.application.applyType,
        cvId: detail.application.cvId,
        notes: detail.application.notes,
      });
    }
  }, [detail, reset]);

  async function onSubmit(data: CreateApplicationInput) {
    const result = isEdit
      ? await updateMutation.mutateAsync(data)
      : await createMutation.mutateAsync(data);
    navigate(`/applications/${result._id}`);
  }

  const mutationError = createMutation.error ?? updateMutation.error;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">
        {isEdit ? t('common.edit') : t('applications.new')}
      </h1>

      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        className="space-y-4 rounded-xl border border-slate/15 bg-white p-6"
      >
        <div>
          <Label htmlFor="jobTitle">{t('applications.form.jobTitle')}</Label>
          <Input id="jobTitle" {...register('jobTitle')} />
          <FieldError>{errors.jobTitle?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="companyName">{t('applications.form.companyName')}</Label>
          <Input id="companyName" {...register('company.name')} />
          <FieldError>{errors.company?.name?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="locationRaw">{t('applications.form.locationRaw')}</Label>
          <Input id="locationRaw" {...register('location.raw')} />
          <FieldError>{errors.location?.raw?.message}</FieldError>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="applyLink">{t('applications.form.applyLink')}</Label>
            <Input id="applyLink" {...register('applyLink')} />
            <FieldError>{errors.applyLink?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="applyType">{t('applications.form.applyType')}</Label>
            <Select id="applyType" {...register('applyType')}>
              {applyTypeValues.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isEdit && detail?.application.sourceUrl && (
          <CopyableUrlField
            label={t('applications.quickView.sourceUrl')}
            value={detail.application.sourceUrl}
          />
        )}

        {cvs && cvs.length > 0 && (
          <div>
            <Label htmlFor="cvId">CV</Label>
            <Select id="cvId" {...register('cvId')}>
              <option value="">—</option>
              {cvs.map((cv) => (
                <option key={cv._id} value={cv._id}>
                  {cv.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="jobDescription">{t('applications.form.jobDescription')}</Label>
          <Textarea id="jobDescription" rows={6} {...register('jobDescription')} />
          <FieldError>{errors.jobDescription?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="notes">{t('applications.form.notes')}</Label>
          <Textarea id="notes" rows={3} {...register('notes')} />
        </div>

        {mutationError && <p className="text-sm text-danger">{mutationError.message}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {t('applications.form.save')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            {t('applications.form.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
