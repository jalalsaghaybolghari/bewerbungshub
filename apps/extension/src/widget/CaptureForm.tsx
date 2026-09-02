import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  applicationStatusValues,
  applyTypeValues,
  createApplicationSchema,
  type CreateApplicationInput,
} from '@bewerber/shared';
import type { ExtractedJobPosting } from '@bewerber/scrapers';
import {
  checkDuplicate,
  checkSimilar,
  createApplication,
  type SimilarApplication,
} from '../lib/applications';
import { ApiError } from '../lib/api-client';
import { Button, FieldError, Input, Label, Select, Textarea } from '../components/ui';

// react-hook-form's form state is the schema's *input* shape (before Zod
// applies `.default()`), not the `CreateApplicationInput` output type —
// same pattern as apps/web/src/applications/ApplicationFormPage.tsx.
type CaptureFormValues = z.input<typeof createApplicationSchema>;

// The apply link to save is the job's own off-site apply URL when the
// extraction found one (e.g. LinkedIn's "Apply on company website"), since
// that's the link a user would actually revisit to apply — the current tab
// URL is only a fallback for in-platform flows like Easy Apply, where there
// is no separate apply URL.
function resolveApplyLink(tabUrl: string, extraction: ExtractedJobPosting): string {
  return extraction.applyLink?.value ?? tabUrl;
}

function defaultValues(
  url: string,
  applyLink: string,
  extraction: ExtractedJobPosting,
): CaptureFormValues {
  return {
    jobTitle: extraction.jobTitle?.value ?? '',
    company: { name: extraction.companyName?.value ?? '' },
    location: { raw: extraction.locationRaw?.value ?? '' },
    jobDescription: extraction.jobDescription?.value ?? '',
    applyLink,
    // The job posting's own page URL, always the captured tab — distinct
    // from applyLink above, which can point off-site (e.g. LinkedIn's
    // Easy Apply "Apply on company website" link). Not a visible field in
    // this form (no input registered for it below); react-hook-form still
    // carries an unregistered defaultValue through to submission, same as
    // `tags`/`postedAt` already do here.
    sourceUrl: url,
    applyType: extraction.applyType?.value ?? 'website',
    // Capturing a posting isn't the same as having applied to it — default
    // to draft rather than createApplicationSchema's own 'applied' default,
    // since clicking Save here just means "I found this," not "I applied."
    status: 'draft',
    tags: [],
    // Not every source can find this (nullable) — an approximate posted/
    // reposted date when one was found, e.g. from LinkedIn's "11 hours ago".
    postedAt: extraction.postedAt?.value,
  };
}

export function CaptureForm({
  url,
  extraction,
  onClose,
}: {
  url: string;
  extraction: ExtractedJobPosting;
  onClose: () => void;
}) {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarApplication[]>([]);
  const [confirmedDespiteSimilar, setConfirmedDespiteSimilar] = useState(false);
  const [saved, setSaved] = useState<'saved' | 'queued' | false>(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const applyLink = resolveApplyLink(url, extraction);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CaptureFormValues, unknown, CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: defaultValues(url, applyLink, extraction),
  });

  const locationValue = watch('location.raw');
  const mapsUrl = locationValue?.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationValue)}`
    : null;
  const jobTitleValue = watch('jobTitle');
  const companyNameValue = watch('company.name');

  useEffect(() => {
    checkDuplicate(applyLink)
      .then((result) => setDuplicateId(result.exists ? result.id : null))
      .catch(() => setDuplicateId(null));
  }, [applyLink]);

  useEffect(() => {
    // Any edit to the fields a prior confirmation was based on must
    // re-require confirmation — a stale "save anyway" must never silently
    // authorize a save against a since-edited title/company/location.
    setConfirmedDespiteSimilar(false);
    if (!jobTitleValue?.trim() || !companyNameValue?.trim() || !locationValue?.trim()) {
      setSimilarMatches([]);
      return;
    }
    const handle = setTimeout(() => {
      checkSimilar(jobTitleValue, companyNameValue, locationValue)
        .then(setSimilarMatches)
        // Fails open, same as checkDuplicate above — an availability blip
        // in this fuzzy check must never trap the user unable to save.
        .catch(() => setSimilarMatches([]));
    }, 400);
    return () => clearTimeout(handle);
  }, [jobTitleValue, companyNameValue, locationValue]);

  async function onSubmit(input: CreateApplicationInput) {
    if (similarMatches.length > 0 && !confirmedDespiteSimilar) return;
    setServerError(null);
    try {
      const result = await createApplication(input);
      setSaved(result.status);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  if (saved) {
    return (
      <div className="space-y-3 p-4">
        {saved === 'saved' ? (
          <p className="text-sm font-medium text-success">Saved to your application tracker.</p>
        ) : (
          <p className="text-sm font-medium text-amber">
            You're offline — this will be saved automatically once you're back online.
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSaved(false)}
          className="w-full"
        >
          Show form again
        </Button>
        <Button type="button" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    );
  }

  const postedAt = extraction.postedAt?.value;

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-3 p-4">
      {postedAt && (
        <p className="text-sm text-slate">Posted {postedAt.toLocaleDateString()} (approximate)</p>
      )}

      {duplicateId && (
        <p className="rounded-lg bg-amber/15 px-3 py-2 text-sm text-amber">
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
              className="mb-1 text-sm text-accent hover:underline"
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
        <Label htmlFor="status">Status</Label>
        <Select id="status" {...register('status')}>
          {applicationStatusValues.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="jobDescription">Description</Label>
        <Textarea id="jobDescription" rows={12} {...register('jobDescription')} />
        <FieldError>{errors.jobDescription?.message}</FieldError>
      </div>

      {serverError && <p className="text-sm text-danger">{serverError}</p>}

      {similarMatches.length > 0 && !confirmedDespiteSimilar ? (
        <div className="space-y-2 rounded-lg bg-amber/15 p-3">
          <p className="text-sm font-medium text-amber">
            This looks similar to {similarMatches.length === 1 ? 'an application' : 'applications'}{' '}
            you already saved:
          </p>
          <ul className="space-y-1 text-sm text-ink">
            {similarMatches.map((m) => (
              <li key={m._id}>
                {m.jobTitle} · {m.company.name}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmedDespiteSimilar(true)}
            className="w-full"
          >
            Save anyway
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={isSubmitting} className="w-full">
          Save application
        </Button>
      )}
    </form>
  );
}
