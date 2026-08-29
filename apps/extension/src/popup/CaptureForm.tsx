import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  applyTypeValues,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@bewerber/shared';
import type { ExtractedJobPosting } from '@bewerber/scrapers';
import { checkDuplicate, createApplication } from '../lib/applications';
import { ApiError } from '../lib/api-client';
import { Button, FieldError, Input, Label, Select, Textarea } from '../components/ui';

// react-hook-form's form state is the schema's *input* shape (before Zod
// applies `.default()`), not the `CreateApplicationInput` output type —
// same pattern as apps/web/src/applications/ApplicationFormPage.tsx.
type CaptureFormValues = z.input<typeof createApplicationSchema>;

function defaultValues(url: string, extraction: ExtractedJobPosting): CaptureFormValues {
  return {
    jobTitle: extraction.jobTitle?.value ?? '',
    company: { name: extraction.companyName?.value ?? '' },
    location: { raw: extraction.locationRaw?.value ?? '' },
    jobDescription: extraction.jobDescription?.value ?? '',
    applyLink: url,
    applyType: extraction.applyType?.value ?? 'website',
    status: 'applied',
    tags: [],
  };
}

export function CaptureForm({ url, extraction }: { url: string; extraction: ExtractedJobPosting }) {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CaptureFormValues, unknown, CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: defaultValues(url, extraction),
  });

  const locationValue = watch('location.raw');
  const mapsUrl = locationValue?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationValue)}`
    : null;

  useEffect(() => {
    checkDuplicate(url)
      .then((result) => setDuplicateId(result.exists ? result.id : null))
      .catch(() => setDuplicateId(null));
  }, [url]);

  async function onSubmit(input: CreateApplicationInput) {
    setServerError(null);
    try {
      await createApplication(input);
      setSaved(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  if (saved) {
    return (
      <div className="p-4">
        <p className="text-sm font-medium text-success">Saved to your application tracker.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3 p-4">
      {duplicateId && (
        <p className="rounded-lg bg-amber/15 px-3 py-2 text-xs text-amber">
          You already have an application saved for this link.
        </p>
      )}

      <div>
        <Label htmlFor="jobTitle">Job title</Label>
        <Input id="jobTitle" {...register('jobTitle')} />
        <FieldError>{errors.jobTitle?.message}</FieldError>
      </div>

      <div>
        <Label htmlFor="companyName">Company</Label>
        <Input id="companyName" {...register('company.name')} />
        <FieldError>{errors.company?.name?.message}</FieldError>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="locationRaw">Location</Label>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1 text-xs text-teal hover:underline"
            >
              Open in Maps
            </a>
          )}
        </div>
        <Input id="locationRaw" {...register('location.raw')} />
        <FieldError>{errors.location?.raw?.message}</FieldError>
      </div>

      <div>
        <Label htmlFor="applyType">Applied via</Label>
        <Select id="applyType" {...register('applyType')}>
          {applyTypeValues.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="jobDescription">Description</Label>
        <Textarea id="jobDescription" rows={4} {...register('jobDescription')} />
        <FieldError>{errors.jobDescription?.message}</FieldError>
      </div>

      {serverError && <p className="text-sm text-danger">{serverError}</p>}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        Save application
      </Button>
    </form>
  );
}
