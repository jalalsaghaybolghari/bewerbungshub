import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { createCvMetadataSchema, type CreateCvMetadataInput } from '@bewerber/shared';
import {
  connectGoogleDrive,
  useCvs,
  useDeleteCv,
  useDisconnectGoogleDrive,
  useGoogleDriveStatus,
  useUpdateCv,
  useUploadCv,
} from './api';
import type { Cv } from './types';
import { Button, Card, FieldError, Input, Label, Select } from '../components/ui';

type CvFormValues = z.input<typeof createCvMetadataSchema>;

function GoogleDriveConnectionBanner() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Captured once, on mount, via a lazy initializer — reading directly
  // from `searchParams` on every render would make the banner disappear
  // the instant the effect below strips the params (which happens on the
  // very next render), rather than staying visible for the user to read.
  const [status] = useState(() => ({
    connected: searchParams.get('driveConnected'),
    error: searchParams.get('driveError'),
  }));

  useEffect(() => {
    if (!status.connected && !status.error) return;
    // Strip the query params once shown, so a page refresh doesn't
    // re-display the same one-time banner.
    const next = new URLSearchParams(searchParams);
    next.delete('driveConnected');
    next.delete('driveError');
    setSearchParams(next, { replace: true });
    // Runs once on mount only — status is captured once above, and
    // searchParams/setSearchParams get new references every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status.connected) {
    return (
      <p className="mb-4 rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
        {t('cvs.googleDrive.connectedBanner')}
      </p>
    );
  }
  if (status.error) {
    return (
      <p className="mb-4 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
        {t('cvs.googleDrive.errorBanner')}
      </p>
    );
  }
  return null;
}

function GoogleDriveConnection() {
  const { t } = useTranslation();
  const { data: status } = useGoogleDriveStatus();
  const disconnect = useDisconnectGoogleDrive();

  if (status?.connected) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-lg border border-slate/15 bg-white px-4 py-3">
        <span className="text-sm text-ink">{t('cvs.googleDrive.connected')}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
        >
          {t('cvs.googleDrive.disconnect')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Button type="button" variant="secondary" onClick={() => void connectGoogleDrive()}>
        {t('cvs.googleDrive.connect')}
      </Button>
    </div>
  );
}

export function CvsPage() {
  const { t } = useTranslation();
  const { data: cvs, isLoading } = useCvs();
  const { data: driveStatus } = useGoogleDriveStatus();
  const upload = useUploadCv();
  const deleteMutation = useDeleteCv();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CvFormValues, unknown, CreateCvMetadataInput>({
    resolver: zodResolver(createCvMetadataSchema),
    defaultValues: { language: 'en', isDefault: false, useGoogleDrive: false },
  });

  // Defaults "Save to Google Drive" to checked once we know the user is
  // actually connected. Starting from a static `false` and syncing here
  // (rather than defaulting the form itself to `true`) matters because the
  // checkbox is hidden entirely for a disconnected user — if the field's
  // default were `true`, a disconnected user's first upload would still
  // silently submit `useGoogleDrive: true` and get rejected by the API
  // with a 400, without ever having seen the checkbox at all.
  useEffect(() => {
    if (driveStatus?.connected) setValue('useGoogleDrive', true);
  }, [driveStatus?.connected, setValue]);

  async function onSubmit(metadata: CreateCvMetadataInput) {
    if (!selectedFile) return;
    await upload.mutateAsync({ file: selectedFile, metadata });
    // Re-apply the connected-default explicitly — a plain reset() would
    // fall back to the static (unchecked) defaultValues above, undoing
    // the effect's sync for every upload after the first.
    reset({
      language: metadata.language,
      isDefault: false,
      useGoogleDrive: driveStatus?.connected ?? false,
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('cvs.title')}</h1>

      <GoogleDriveConnectionBanner />
      <GoogleDriveConnection />

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
          {driveStatus?.connected && (
            <label className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" {...register('useGoogleDrive')} />
              {t('cvs.googleDrive.saveToGoogleDrive')}
            </label>
          )}
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
            <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              {t('cvs.default')}
            </span>
          )}
          {cv.storageProvider === 'google-drive' && (
            <span className="ml-2 rounded-full bg-slate/15 px-2 py-0.5 text-xs font-semibold text-slate">
              {t('cvs.googleDrive.badge')}
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
            className="text-sm text-accent hover:underline"
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
