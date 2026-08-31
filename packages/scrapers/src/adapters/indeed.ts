import type { ExtractedJobPosting } from '../types';
import { extractGeneric } from './generic';
import { mergeExtractions } from '../merge';

// Indeed operates under several country-specific domains (indeed.com,
// de.indeed.com, at.indeed.com, …) — matched by substring rather than an
// exact/endsWith hostname check, since the full ccTLD set isn't something
// to guess at without live access to confirm which ones actually exist.
export function matchesIndeed(url: string): boolean {
  try {
    return new URL(url).hostname.includes('indeed');
  } catch {
    return false;
  }
}

// Deliberately thin, unlike the LinkedIn adapter — no browser tool
// available to load a real Indeed job page and verify its actual markup,
// so there's nothing to safely scrape beyond what the generic JSON-LD
// extractor already handles. Indeed is large enough to generally publish
// standard schema.org/JobPosting data for SEO; this just adds the one
// thing no generic extractor could ever infer — which site it came from.
// Not verified against a real page — expect a live-iteration pass, same
// as LinkedIn's adapter needed.
export function extractIndeed(document: Document): ExtractedJobPosting {
  return mergeExtractions(extractGeneric(document), {
    applyType: { value: 'indeed', confidence: 1, source: 'site-adapter' },
  });
}
