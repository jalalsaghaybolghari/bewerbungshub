import type { ExtractedJobPosting } from '../types';
import { extractGeneric } from './generic';
import { mergeExtractions } from '../merge';

const TITLE_SUFFIX = /\s*\|\s*LinkedIn\s*$/i;

export function matchesLinkedIn(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith('linkedin.com') && pathname.startsWith('/jobs/');
  } catch {
    return false;
  }
}

export function extractLinkedIn(document: Document): ExtractedJobPosting {
  const base = extractGeneric(document);

  const overrides: ExtractedJobPosting = {
    applyType: { value: 'linkedin', confidence: 1, source: 'site-adapter' },
  };

  if (base.jobTitle && TITLE_SUFFIX.test(base.jobTitle.value)) {
    overrides.jobTitle = {
      value: base.jobTitle.value.replace(TITLE_SUFFIX, '').trim(),
      confidence: 0.95,
      source: 'site-adapter',
    };
  }

  return mergeExtractions(base, overrides);
}
