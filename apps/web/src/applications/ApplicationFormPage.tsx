import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { RichTextEditor } from '../components/RichTextEditor';
import { TrashIcon } from '../components/icons';

// react-hook-form's form state is the schema's *input* shape (before Zod
// applies `.default()`), not the `CreateApplicationInput` output type.
type ApplicationFormValues = z.input<typeof createApplicationSchema>;

// Matches relatedLinkSchema's own max(5) in packages/shared — kept in
// sync here so the "Add link" button disables itself before a submit
// would otherwise round-trip to the server just to be rejected.
const MAX_RELATED_LINKS = 5;

export function ApplicationFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  // Populated when arriving from the Email Tracking page's "Add
  // application" link on an unmatched email — lets the user start the new
  // application already scoped to the right company instead of retyping
  // it from the email.
  const prefillCompany = !isEdit ? searchParams.get('company') : null;
  // Same origin as prefillCompany above — carries the email itself over
  // as a related link, so it doesn't have to be re-added by hand once the
  // application exists. Both must be present (a label with no URL isn't a
  // usable link); linkUrl alone falls back to the subject as the label.
  const prefillLinkUrl = !isEdit ? searchParams.get('linkUrl') : null;
  const prefillLinkLabel = !isEdit ? searchParams.get('linkLabel') : null;

  const { data: detail } = useApplication(id);
  const { data: cvs } = useCvs();
  const createMutation = useCreateApplication();
  const updateMutation = useUpdateApplication(id ?? '');

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues, unknown, CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: { applyType: 'website', tags: [], relatedLinks: [] },
  });

  const relatedLinks = useFieldArray({ control, name: 'relatedLinks' });

  useEffect(() => {
    if (prefillCompany) {
      setValue('company.name', prefillCompany);
    }
    if (prefillLinkUrl) {
      relatedLinks.append({ label: prefillLinkLabel ?? prefillLinkUrl, url: prefillLinkUrl });
    }
    // Only meant to run once, from the initial URL — not on every
    // keystroke if the user then edits the field themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        relatedLinks: detail.application.relatedLinks,
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
          <Label>{t('applications.form.relatedLinks')}</Label>
          <div className="space-y-2">
            {relatedLinks.fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    placeholder={t('applications.form.relatedLinkLabel')}
                    {...register(`relatedLinks.${index}.label`)}
                  />
                  <FieldError>{errors.relatedLinks?.[index]?.label?.message}</FieldError>
                </div>
                <div className="flex-1">
                  <Input
                    placeholder={t('applications.form.relatedLinkUrl')}
                    {...register(`relatedLinks.${index}.url`)}
                  />
                  <FieldError>{errors.relatedLinks?.[index]?.url?.message}</FieldError>
                </div>
                <button
                  type="button"
                  onClick={() => relatedLinks.remove(index)}
                  aria-label={t('applications.form.removeLink')}
                  className="mt-2 shrink-0 text-slate hover:text-danger"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
          {relatedLinks.fields.length < MAX_RELATED_LINKS && (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={() => relatedLinks.append({ label: '', url: '' })}
            >
              {t('applications.form.addLink')}
            </Button>
          )}
        </div>

        <div>
          <Label htmlFor="jobDescription">{t('applications.form.jobDescription')}</Label>
          {/* RichTextEditor emits HTML (Tiptap's native format) via
              onChange, but accepts either that or the "## heading" /
              "**bold**" Markdown-ish text the extension's scrapers
              produce — it converts the latter on the way in, so an
              extension-captured description shows real formatting here
              too, not raw ** or # syntax. Becomes real HTML in storage
              the moment it's saved through this editor. */}
          <Controller
            name="jobDescription"
            control={control}
            render={({ field }) => (
              <RichTextEditor value={field.value ?? ''} onChange={field.onChange} />
            )}
          />
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
