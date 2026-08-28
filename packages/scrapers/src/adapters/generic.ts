import type { ExtractedJobPosting } from '../types';
import { extractJsonLd } from '../extractors/json-ld';
import { extractMicrodata } from '../extractors/microdata';
import { extractHeuristic } from '../extractors/heuristic';
import { mergeExtractions } from '../merge';

export function extractGeneric(document: Document): ExtractedJobPosting {
  return mergeExtractions(extractHeuristic(document), extractMicrodata(document), extractJsonLd(document));
}
