import type { ExtractedJobPosting } from '../types';

export function extractHeuristic(document: Document): ExtractedJobPosting {
  const result: ExtractedJobPosting = {};

  const heading = document.querySelector('h1')?.textContent?.trim();
  const title = heading || document.title.trim();
  if (title) {
    result.jobTitle = { value: title, confidence: 0.2, source: 'heuristic' };
  }

  const description = document
    .querySelector('meta[name="description"]')
    ?.getAttribute('content')
    ?.trim();
  if (description) {
    result.jobDescription = { value: description, confidence: 0.2, source: 'heuristic' };
  }

  return result;
}
