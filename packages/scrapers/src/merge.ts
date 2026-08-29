import type { ExtractedField, ExtractedJobPosting } from './types';

function higherConfidence<T>(
  a: ExtractedField<T> | undefined,
  b: ExtractedField<T> | undefined,
): ExtractedField<T> | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.confidence > a.confidence ? b : a;
}

export function mergeExtractions(...extractions: ExtractedJobPosting[]): ExtractedJobPosting {
  return extractions.reduce<ExtractedJobPosting>(
    (merged, next) => ({
      jobTitle: higherConfidence(merged.jobTitle, next.jobTitle),
      companyName: higherConfidence(merged.companyName, next.companyName),
      locationRaw: higherConfidence(merged.locationRaw, next.locationRaw),
      jobDescription: higherConfidence(merged.jobDescription, next.jobDescription),
      applyType: higherConfidence(merged.applyType, next.applyType),
      applyLink: higherConfidence(merged.applyLink, next.applyLink),
    }),
    {},
  );
}
