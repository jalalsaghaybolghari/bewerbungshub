import type { ExtractedJobPosting } from '../types';

function metaContent(document: Document, property: string): string | undefined {
  const el = document.querySelector(`meta[property="${property}"]`);
  const content = el?.getAttribute('content')?.trim();
  return content || undefined;
}

function microdataItemProp(document: Document, itemprop: string): string | undefined {
  const scope = document.querySelector('[itemscope][itemtype*="JobPosting"]');
  const el = scope?.querySelector(`[itemprop="${itemprop}"]`);
  const text = el?.getAttribute('content')?.trim() || el?.textContent?.trim();
  return text || undefined;
}

export function extractMicrodata(document: Document): ExtractedJobPosting {
  const result: ExtractedJobPosting = {};

  const title = microdataItemProp(document, 'title') ?? metaContent(document, 'og:title');
  if (title) {
    result.jobTitle = { value: title, confidence: 0.6, source: 'microdata' };
  }

  const company = microdataItemProp(document, 'hiringOrganization') ?? metaContent(document, 'og:site_name');
  if (company) {
    result.companyName = { value: company, confidence: 0.55, source: 'microdata' };
  }

  const location = microdataItemProp(document, 'jobLocation');
  if (location) {
    result.locationRaw = { value: location, confidence: 0.55, source: 'microdata' };
  }

  const description = microdataItemProp(document, 'description') ?? metaContent(document, 'og:description');
  if (description) {
    result.jobDescription = { value: description, confidence: 0.6, source: 'microdata' };
  }

  return result;
}
