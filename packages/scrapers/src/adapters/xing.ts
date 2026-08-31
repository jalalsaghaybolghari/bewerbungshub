import type { ExtractedJobPosting } from '../types';
import { extractGeneric } from './generic';
import { mergeExtractions } from '../merge';

export function matchesXing(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('xing.com');
  } catch {
    return false;
  }
}

// Deliberately thin, unlike the LinkedIn adapter — no browser tool
// available to load a real Xing job page and verify its actual markup, so
// there's nothing to safely scrape beyond what the generic JSON-LD
// extractor already handles. Xing is large enough to generally publish
// standard schema.org/JobPosting data for SEO; this just adds the one
// thing no generic extractor could ever infer — which site it came from.
// Not verified against a real page — expect a live-iteration pass, same
// as LinkedIn's adapter needed.
export function extractXing(document: Document): ExtractedJobPosting {
  return mergeExtractions(extractGeneric(document), {
    applyType: { value: 'xing', confidence: 1, source: 'site-adapter' },
  });
}
