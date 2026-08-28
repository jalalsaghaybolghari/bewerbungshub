import type { ExtractedJobPosting } from './types';
import { extractGeneric } from './adapters/generic';
import { matchesLinkedIn, extractLinkedIn } from './adapters/linkedin';

export function resolveJobPosting(url: string, document: Document): ExtractedJobPosting {
  if (matchesLinkedIn(url)) return extractLinkedIn(document);
  return extractGeneric(document);
}
