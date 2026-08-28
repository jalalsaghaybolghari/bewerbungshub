import type { ExtractedJobPosting } from '../types';

interface JobPostingNode {
  '@type'?: string | string[];
  title?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } } | string;
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

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function locationText(location: JobPostingNode['jobLocation']): string | undefined {
  if (!location) return undefined;
  if (typeof location === 'string') return location;
  const { addressLocality, addressCountry } = location.address ?? {};
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
    if (node.description) {
      result.jobDescription = { value: stripHtml(node.description), confidence: 0.85, source: 'json-ld' };
    }
    return result;
  }
  return {};
}
