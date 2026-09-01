import type { ExtractedJobPosting } from '../types';
import { elementToMarkdown } from '../html-to-markdown';

interface PlaceNode {
  address?: { addressLocality?: string; addressCountry?: string };
}

interface JobPostingNode {
  '@type'?: string | string[];
  title?: string;
  hiringOrganization?: { name?: string } | string;
  // schema.org allows a single Place *or* an array of them (multi-location
  // postings) — live-verified on Xing, whose jobLocation is always an
  // array even for a single-location posting, unlike LinkedIn's fixture,
  // which uses a bare object. Assuming only the object shape silently
  // dropped Xing's location entirely (location.address was undefined on
  // an array, not a thrown error, so nothing flagged it).
  jobLocation?: PlaceNode | PlaceNode[] | string;
  description?: string;
}

function isJobPostingNode(node: unknown): node is JobPostingNode {
  if (typeof node !== 'object' || node === null) return false;
  const type = (node as JobPostingNode)['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

function findJobPostingNode(parsed: unknown): JobPostingNode | undefined {
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const found = findJobPostingNode(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (isJobPostingNode(parsed)) return parsed;
  if (typeof parsed === 'object' && parsed !== null && '@graph' in parsed) {
    return findJobPostingNode((parsed as { '@graph': unknown })['@graph']);
  }
  return undefined;
}

// JobPosting.description is an HTML string (per schema.org), not plain
// text — parse it into a detached element via the same `document` so it
// converts to Markdown the same way the LinkedIn DOM extractor's live
// description does, instead of flattening formatting away.
function descriptionMarkdown(document: Document, html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  return elementToMarkdown(container);
}

function locationText(location: JobPostingNode['jobLocation']): string | undefined {
  if (!location) return undefined;
  if (typeof location === 'string') return location;
  // Only the first location for a multi-location posting — locationRaw is
  // a single string field, and picking one consistently beats guessing at
  // how to concatenate an unbounded list.
  const place = Array.isArray(location) ? location[0] : location;
  const { addressLocality, addressCountry } = place?.address ?? {};
  return [addressLocality, addressCountry].filter(Boolean).join(', ') || undefined;
}

function companyName(org: JobPostingNode['hiringOrganization']): string | undefined {
  if (!org) return undefined;
  return typeof org === 'string' ? org : org.name;
}

export function extractJsonLd(document: Document): ExtractedJobPosting {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const node = findJobPostingNode(parsed);
    if (!node) continue;

    const result: ExtractedJobPosting = {};
    if (node.title) {
      result.jobTitle = { value: node.title, confidence: 0.9, source: 'json-ld' };
    }
    const company = companyName(node.hiringOrganization);
    if (company) {
      result.companyName = { value: company, confidence: 0.9, source: 'json-ld' };
    }
    const location = locationText(node.jobLocation);
    if (location) {
      result.locationRaw = { value: location, confidence: 0.85, source: 'json-ld' };
    }
    const description = node.description && descriptionMarkdown(document, node.description);
    if (description) {
      result.jobDescription = { value: description, confidence: 0.85, source: 'json-ld' };
    }
    return result;
  }
  return {};
}
