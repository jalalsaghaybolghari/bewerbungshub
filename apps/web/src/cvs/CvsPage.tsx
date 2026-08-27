import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createCvMetadataSchema, type CreateCvMetadataInput } from '@bewerber/shared';
import { useCvs, useDeleteCv, useUpdateCv, useUploadCv } from './api';
import type { Cv } from './types';
import { Button, Card, FieldError, Input, Label, Select } from '../components/ui';

type CvFormValues = z.input<typeof createCvMetadataSchema>;

export function CvsPage() {
  const { t } = useTranslation();
  const { data: cvs, isLoading } = useCvs();
  const upload = useUploadCv();
  const deleteMutation = useDeleteCv();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CvFormValues, unknown, CreateCvMetadataInput>({
    resolver: zodResolver(createCvMetadataSchema),
    defaultValues: { language: 'en', isDefault: false },
  });

  async function onSubmit(metadata: CreateCvMetadataInput) {
    if (!selectedFile) return;
    await upload.mutateAsync({ file: selectedFile, metadata });
    reset();
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('cvs.title')}</h1>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-ink">{t('cvs.upload')}</h2>
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div>
            <Label htmlFor="cv-file">PDF</Label>
            <input
              id="cv-file"
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="label">{t('cvs.label')}</Label>
              <Input id="label" {...register('label')} />
              <FieldError>{errors.label?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="language">{t('cvs.language')}</Label>
              <Select id="language" {...register('language')}>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" {...register('isDefault')} />
            {t('cvs.setDefault')}
          </label>
          {upload.error && <p className="text-sm text-danger">{upload.error.message}</p>}
          <Button type="submit" disabled={!selectedFile || upload.isPending}>
            {t('cvs.upload')}
          </Button>
        </form>
      </Card>

      {isLoading && <p className="text-slate">{t('common.loading')}</p>}
      {cvs && cvs.length === 0 && <p className="text-slate">{t('cvs.empty')}</p>}

      <div className="space-y-3">
        {cvs?.map((cv) => (
          <CvRow key={cv._id} cv={cv} onDelete={() => deleteMutation.mutate(cv._id)} />
        ))}
      </div>
    </div>
  );
}

function CvRow({ cv, onDelete }: { cv: Cv; onDelete: () => void }) {
  const { t } = useTranslation();
  const updateMutation = useUpdateCv(cv._id);

  return (
    <Card className="flex items-center justify-between py-4">
      <div>
        <div className="font-semibold text-ink">
          {cv.label}
          {cv.isDefault && (
            <span className="ml-2 rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
              {t('cvs.default')}
            </span>
          )}
        </div>
        <div className="text-xs text-slate">
          {cv.fileName} · {cv.language.toUpperCase()} · {(cv.sizeBytes / 1024).toFixed(0)} KB
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!cv.isDefault && (
          <button
            className="text-sm text-teal hover:underline"
            onClick={() => updateMutation.mutate({ isDefault: true })}
          >
            {t('cvs.setDefault')}
          </button>
        )}
        <button className="text-sm text-danger hover:underline" onClick={onDelete}>
          {t('cvs.delete')}
        </button>
      </div>
    </Card>
  );
}
