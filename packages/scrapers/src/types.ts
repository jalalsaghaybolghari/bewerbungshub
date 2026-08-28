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
}
