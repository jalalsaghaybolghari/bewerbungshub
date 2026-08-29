import type { ApplyType } from '@bewerber/shared';

export type ExtractionSource = 'site-adapter' | 'json-ld' | 'microdata' | 'heuristic';

export interface ExtractedField<T> {
  value: T;
  confidence: number;
  source: ExtractionSource;
}

export interface ExtractedJobPosting {
  jobTitle?: ExtractedField<string>;
  companyName?: ExtractedField<string>;
  locationRaw?: ExtractedField<string>;
  jobDescription?: ExtractedField<string>;
  applyType?: ExtractedField<ApplyType>;
  // Only set when a genuine off-site apply URL was found (e.g. LinkedIn's
  // "Apply on company website" link). Left unset for in-platform flows like
  // LinkedIn's Easy Apply — the current tab's URL is the right applyLink
  // there, which is the caller's fallback to make, not this package's.
  applyLink?: ExtractedField<string>;
  // When the listing was posted/reposted — not every source can find this,
  // so it's optional. A best-effort approximation where present (e.g.
  // derived from a relative "11 hours ago" label), not a precise timestamp.
  postedAt?: ExtractedField<Date>;
}
