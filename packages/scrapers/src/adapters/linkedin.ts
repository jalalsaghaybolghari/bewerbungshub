import type { ExtractedJobPosting } from '../types';
import { extractGeneric } from './generic';
import { mergeExtractions } from '../merge';
import { elementToMarkdown } from '../html-to-markdown';

const TITLE_SUFFIX = /\s*\|\s*LinkedIn\s*$/i;
const NON_LOCATION_LINE = /ago$|clicked apply|viewed|applicants?|^promoted|responses managed/i;
const ABOUT_HEADING = /about the job/i;
const APPLY_ON_COMPANY_SITE = /apply on company website/i;
// Matches both "Reposted 11 hours ago" and a bare "13 hours ago" / "4 days
// ago" — LinkedIn shows the latter for a listing's original posting date.
const RELATIVE_TIME = /^(?:reposted\s+)?(\d+)\s*(minute|hour|day|week|month)s?\s+ago$/i;
const RELATIVE_TIME_UNIT_MS: Record<string, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

// A best-effort approximation, not a precise timestamp — LinkedIn's own
// label is only precise to the hour/day itself.
function parseRelativeTime(text: string): Date | undefined {
  const match = RELATIVE_TIME.exec(text.trim());
  if (!match) return undefined;
  const unitMs = RELATIVE_TIME_UNIT_MS[match[2].toLowerCase()];
  return unitMs ? new Date(Date.now() - Number(match[1]) * unitMs) : undefined;
}

export function matchesLinkedIn(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith('linkedin.com') && pathname.startsWith('/jobs/');
  } catch {
    return false;
  }
}

// Collects the trimmed text of each "leaf" element (one with no element
// children) under `el`, in document order — a layout-free stand-in for
// `innerText`'s line-per-block behavior. Real browsers compute `innerText`
// fine, but jsdom (used in this package's tests) doesn't implement it at
// all, so this is written to work identically in both rather than depend on
// browser-only rendering. Note this only sees real text nodes: LinkedIn
// draws the "·" between location/posted-time/applicant-count visually via
// CSS, not as DOM text, so those three end up as three separate lines here
// with no "·" in any of them — don't assume it'll show up in the text.
function leafTexts(el: Element): string[] {
  if (el.children.length === 0) {
    const text = el.textContent?.trim();
    return text ? [text] : [];
  }
  return Array.from(el.children).flatMap(leafTexts);
}

// LinkedIn's live job pages (both the standalone /jobs/view/<id> page and the
// /jobs/search-results/ split panel, checked directly against real markup)
// carry no JobPosting JSON-LD, microdata, or OpenGraph tags at all — despite
// that being the documented convention this package's other extractors rely
// on. Company/location/postedAt have to come from the rendered DOM instead.
//
// Rather than hardcode LinkedIn's hashed/rotating CSS classes (which the
// adapter resolution order in the project plan explicitly avoids), this
// anchors on a structural fact that's much more stable: the company name
// always sits in a link to `/company/...`, and the location is the first
// non-boilerplate leaf line after it within that link's nearby ancestor
// scope. The split-panel layout (unlike the standalone page) also includes
// the job title as one of those leaf lines, right before the location — so
// "first line after company" isn't always the location; the loop below
// additionally skips a line that matches document.title's job-title portion.
function extractLinkedInDom(document: Document): ExtractedJobPosting {
  const anchor = document.querySelector('a[href*="/company/"]');
  const companyName = anchor?.textContent?.trim();
  if (!anchor || !companyName) return {};

  const result: ExtractedJobPosting = {
    companyName: { value: companyName, confidence: 0.85, source: 'site-adapter' },
  };

  // Walk up until the scope also contains the "Promoted by hirer ·
  // Responses managed off LinkedIn" boilerplate line, which reliably marks
  // having reached the job header block (it's one of the few leaf lines
  // that carries a literal "·" character, unlike the location/posted-time/
  // applicant-count line, which is visually "·"-separated via CSS only).
  let scope: HTMLElement | null = anchor.parentElement;
  for (let i = 0; i < 6 && scope && !scope.textContent?.includes('·'); i++) {
    scope = scope.parentElement;
  }
  if (!scope) return result;

  // LinkedIn's <title> is consistently "<Job Title> | <Company> | LinkedIn"
  // (verified live) — the portion before the first "|" recognizes and skips
  // a job-title leaf line, whichever layout put it in this scope.
  const pageTitle = document.title.split('|')[0]?.trim();

  const lines = leafTexts(scope);
  const companyIndex = lines.indexOf(companyName);
  const candidate =
    companyIndex >= 0
      ? lines
          .slice(companyIndex + 1)
          .find((line) => line !== pageTitle && !NON_LOCATION_LINE.test(line))
      : undefined;
  if (candidate) {
    result.locationRaw = { value: candidate, confidence: 0.75, source: 'site-adapter' };
  }

  const postedAt = lines.map(parseRelativeTime).find((date) => date !== undefined);
  if (postedAt) {
    result.postedAt = { value: postedAt, confidence: 0.7, source: 'site-adapter' };
  }

  return result;
}

// The job description sits in a container right after a heading matching
// "About the job" (LinkedIn's standard section label, present even when the
// posting's own content — including a second, employer-written heading — is
// in another language, e.g. a German "Jobbeschreibung" line). Converts the
// container to Markdown on a clone with the heading removed, rather than
// string-slicing the heading's text off the front — robust to the heading
// being nested at whatever depth, and lets elementToMarkdown produce real
// structure (paragraphs, lists, bold) for the description that follows.
function extractLinkedInDescription(document: Document): ExtractedJobPosting {
  function findHeading(root: ParentNode) {
    return [...root.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && ABOUT_HEADING.test(el.textContent ?? ''),
    );
  }

  const heading = findHeading(document);
  const container = heading?.parentElement?.parentElement;
  if (!heading || !container) return {};

  const clone = container.cloneNode(true) as Element;
  findHeading(clone)?.remove();

  const description = elementToMarkdown(clone);
  if (!description) return {};

  return { jobDescription: { value: description, confidence: 0.75, source: 'site-adapter' } };
}

// LinkedIn routes every off-site "Apply" link through a safety-check
// redirector (`linkedin.com/safety/go/?url=<encoded target>`) rather than
// linking to the employer's site directly — verified live. Reliably
// distinguished from an in-platform Easy Apply button, which carries no such
// label, by its aria-label ("Apply on company website"). The real
// destination is the redirector URL's own `url` query parameter.
function extractLinkedInApplyLink(document: Document): ExtractedJobPosting {
  const anchor = [...document.querySelectorAll('a')].find((el) =>
    APPLY_ON_COMPANY_SITE.test(el.getAttribute('aria-label') ?? ''),
  );
  const href = anchor?.getAttribute('href');
  if (!href) return {};

  try {
    const target = new URL(href, document.baseURI).searchParams.get('url');
    if (!target) return {};
    return { applyLink: { value: target, confidence: 0.9, source: 'site-adapter' } };
  } catch {
    return {};
  }
}

export function extractLinkedIn(document: Document): ExtractedJobPosting {
  const base = mergeExtractions(
    extractGeneric(document),
    extractLinkedInDom(document),
    extractLinkedInDescription(document),
    extractLinkedInApplyLink(document),
  );

  const overrides: ExtractedJobPosting = {
    applyType: { value: 'linkedin', confidence: 1, source: 'site-adapter' },
  };

  // Cleans up the "| LinkedIn" suffix on a title read from document.title
  // (via JSON-LD or the heuristic fallback) — the only reliable source
  // found for the title across the real pages checked, since it wasn't
  // consistently present in extractLinkedInDom's scope. Confidence just
  // needs to outrank the raw un-stripped title it's cleaning up.
  if (base.jobTitle && TITLE_SUFFIX.test(base.jobTitle.value)) {
    overrides.jobTitle = {
      value: base.jobTitle.value.replace(TITLE_SUFFIX, '').trim(),
      confidence: 0.95,
      source: 'site-adapter',
    };
  }

  return mergeExtractions(base, overrides);
}
