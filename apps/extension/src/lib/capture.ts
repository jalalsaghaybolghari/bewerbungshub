import type { ExtractedJobPosting } from '@bewerber/scrapers';

export interface CaptureResult {
  url: string;
  extraction: ExtractedJobPosting;
}

export class CaptureError extends Error {}

export async function captureActiveTab(): Promise<CaptureResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new CaptureError('No active tab to capture.');
  }

  let injectionResults: chrome.scripting.InjectionResult[];
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // Path relative to the extension root, matching vite.config.ts's
      // stable entryFileNames output for the content-script chunk.
      files: ['content-script.js'],
    });
  } catch {
    throw new CaptureError('Could not read this page. Try a regular job posting page.');
  }

  const raw = (injectionResults[0]?.result as ExtractedJobPosting | undefined) ?? {};
  return { url: tab.url, extraction: normalizeExtraction(raw) };
}

// chrome.scripting.executeScript's result crosses a serialization boundary
// that does not preserve Date objects at all — verified live, a returned
// Date arrives here as a plain empty object (Date has no own enumerable
// properties, so whatever copy mechanism Chrome uses drops the value
// entirely; it's not recoverable by the time it reaches this function). The
// actual fix is in content-script/index.ts, which converts postedAt to an
// ISO string before returning, since plain strings do survive the boundary.
// This is a safety net for that, converting the string back to a real Date,
// and dropping postedAt entirely on the off chance it's ever something
// `new Date(...)` still can't parse — an Invalid Date silently fails
// createApplicationSchema's z.coerce.date() validation with no visible field
// error (postedAt isn't a registered/visible form input), which blocked the
// *entire* save with zero feedback the first time this was caught live.
function normalizeExtraction(extraction: ExtractedJobPosting): ExtractedJobPosting {
  if (!extraction.postedAt) return extraction;

  const value = new Date(extraction.postedAt.value);
  if (Number.isNaN(value.getTime())) {
    const { postedAt: _postedAt, ...rest } = extraction;
    return rest;
  }

  return { ...extraction, postedAt: { ...extraction.postedAt, value } };
}
