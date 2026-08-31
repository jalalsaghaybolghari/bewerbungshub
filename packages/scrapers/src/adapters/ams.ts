import type { ExtractedJobPosting } from '../types';
import { extractHeuristic } from '../extractors/heuristic';
import { extractJsonLd } from '../extractors/json-ld';
import { elementToMarkdown } from '../html-to-markdown';
import { mergeExtractions } from '../merge';

// jobs.ams.at — Austria's public employment service job portal. The user
// shared a real screenshot of a live posting (not markup, just the
// rendered page), which is more than what's known about Xing/StepStone/
// Indeed, but still not enough to build LinkedIn-style DOM scraping from
// — there's no way to confirm actual element structure or class names
// without the real HTML. Matched on the exact `jobs.ams.at` host rather
// than a broader `ams.at` substring: unlike StepStone/Indeed's many
// legitimate ccTLD variants, AMS is a single Austrian government service
// with one known job-listing host, no ccTLD guessing needed here.
export function matchesAms(url: string): boolean {
  try {
    return new URL(url).hostname === 'jobs.ams.at';
  } catch {
    return false;
  }
}

// Live-verified (via the user's own browser, plus fetching two different
// real job pages directly): jobs.ams.at ships no JSON-LD at all, and both
// its og:title/og:description AND its <meta name="description"> tags are
// static site-wide defaults ("alle jobs - die Stellensuche des AMS...")
// — byte-identical across different job postings, never updated per-job
// by the Angular app. So, unlike the Xing/StepStone/Indeed adapters, this
// never defers to `extractGeneric`/its microdata step at all.
//
// The user eventually pasted the real detail page's rendered
// `document.body.innerHTML` (via DevTools), which turned up stable,
// developer-assigned element ids (`#ams-detail-*`) — not Angular's
// random per-build `_ngcontent-*` hashes — for every field: title,
// company, location (inside the "Überblick" key-value table), and the
// job description paragraph. Confidence 0.85/0.8 here, similar to
// LinkedIn's live-verified DOM scraping, since this is now a real
// verified selector, not a guess.
function text(document: Document, selector: string): string | undefined {
  return document.querySelector(selector)?.textContent?.trim() || undefined;
}

// The user explicitly asked for the *whole* content section as the
// description, not just the "Stellenbeschreibung" paragraph — company
// description, competencies, education/experience requirements, driving
// licence, equal-treatment/accessibility notes, and the recruiter's
// contact details are all inside the same `<lib-detail-content>` element
// (a distinctive, single-use Angular component tag on this page, unlike
// generic Bootstrap grid classes like `.col-md-12` that also live inside
// it). Converted to Markdown so headings/lists survive, same approach
// `extractJsonLd` already uses for HTML job-description strings.
function fullDescriptionMarkdown(document: Document): string | undefined {
  const content = document.querySelector('lib-detail-content');
  if (!content) return undefined;
  const markdown = elementToMarkdown(content);
  return markdown || undefined;
}

// Kept as a fallback for if AMS ever changes this markup: the detail
// page's <h1> concatenates a visible title span with a visually-hidden
// "bei <company>" span (screen-reader text), so even a bare `<h1>` grab
// still yields a splittable "<title> bei <company>" string. Confidence
// 0.5 — below the verified selectors above, so those win whenever
// present, but still better than nothing if the ids above go missing.
const TITLE_AT_COMPANY = /^(.*?)\s+bei\s+(.+)$/i;

function fallbackFromHeading(document: Document): ExtractedJobPosting {
  const { jobTitle } = extractHeuristic(document);
  const match = jobTitle?.value.match(TITLE_AT_COMPANY);
  if (!match) return { jobTitle };
  return {
    jobTitle: { value: match[1].trim(), confidence: 0.5, source: 'site-adapter' },
    companyName: { value: match[2].trim(), confidence: 0.5, source: 'site-adapter' },
  };
}

export function extractAms(document: Document): ExtractedJobPosting {
  const jobTitle = text(document, '#ams-detail-details-header');
  const companyName = text(document, '#ams-detail-companyname-text');
  const locationRaw = text(document, '#ams-detail-location [data-testid="key-value-pair-content"]');
  const jobDescription = fullDescriptionMarkdown(document);

  const verified: ExtractedJobPosting = {
    ...(jobTitle && { jobTitle: { value: jobTitle, confidence: 0.85, source: 'site-adapter' } }),
    ...(companyName && {
      companyName: { value: companyName, confidence: 0.85, source: 'site-adapter' },
    }),
    ...(locationRaw && {
      locationRaw: { value: locationRaw, confidence: 0.8, source: 'site-adapter' },
    }),
    ...(jobDescription && {
      jobDescription: { value: jobDescription, confidence: 0.8, source: 'site-adapter' },
    }),
  };

  return mergeExtractions(verified, fallbackFromHeading(document), extractJsonLd(document), {
    applyType: { value: 'ams', confidence: 1, source: 'site-adapter' },
  });
}
