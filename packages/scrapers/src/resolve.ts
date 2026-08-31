import type { ExtractedJobPosting } from './types';
import { extractGeneric } from './adapters/generic';
import { matchesLinkedIn, extractLinkedIn } from './adapters/linkedin';
import { matchesXing, extractXing } from './adapters/xing';
import { matchesStepStone, extractStepStone } from './adapters/stepstone';
import { matchesIndeed, extractIndeed } from './adapters/indeed';
import { matchesAms, extractAms } from './adapters/ams';

export function resolveJobPosting(url: string, document: Document): ExtractedJobPosting {
  if (matchesLinkedIn(url)) return extractLinkedIn(document);
  if (matchesXing(url)) return extractXing(document);
  if (matchesStepStone(url)) return extractStepStone(document);
  if (matchesIndeed(url)) return extractIndeed(document);
  if (matchesAms(url)) return extractAms(document);
  return extractGeneric(document);
}
