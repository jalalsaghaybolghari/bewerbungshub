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

  const extraction = (injectionResults[0]?.result as ExtractedJobPosting | undefined) ?? {};
  return { url: tab.url, extraction };
}
