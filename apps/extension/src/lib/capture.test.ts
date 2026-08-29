import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureActiveTab, CaptureError } from './capture';

const tabsQueryMock = vi.fn();
const executeScriptMock = vi.fn();

Object.assign(globalThis.chrome, {
  tabs: { query: (...args: unknown[]) => tabsQueryMock(...args) },
  scripting: { executeScript: (...args: unknown[]) => executeScriptMock(...args) },
});

describe('captureActiveTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the tab URL and extraction from the injected content script (happy path)', async () => {
    tabsQueryMock.mockResolvedValueOnce([{ id: 1, url: 'https://example.com/jobs/1' }]);
    executeScriptMock.mockResolvedValueOnce([
      { result: { jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' } } },
    ]);

    const result = await captureActiveTab();

    expect(result.url).toBe('https://example.com/jobs/1');
    expect(result.extraction.jobTitle?.value).toBe('Engineer');
  });

  // chrome.scripting.executeScript's result crosses a serialization boundary
  // that silently turns Date objects into ISO strings — verified live, see
  // normalizeExtraction in capture.ts. This asserts the fix-up actually
  // produces a real Date instance, not just an object that looks like one.
  it('normalizes a postedAt value that arrived as a string back into a real Date (edge case)', async () => {
    tabsQueryMock.mockResolvedValueOnce([{ id: 1, url: 'https://example.com/jobs/1' }]);
    executeScriptMock.mockResolvedValueOnce([
      {
        result: {
          postedAt: { value: '2026-08-28T01:00:00.000Z', confidence: 0.7, source: 'site-adapter' },
        },
      },
    ]);

    const result = await captureActiveTab();

    expect(result.extraction.postedAt?.value).toBeInstanceOf(Date);
    expect(result.extraction.postedAt?.value.toISOString()).toBe('2026-08-28T01:00:00.000Z');
  });

  // Observed live: for some pages the value that crosses the executeScript
  // boundary isn't a valid date at all (not a real Date, not a parseable
  // string). An Invalid Date silently failed createApplicationSchema's
  // z.coerce.date() validation with no visible error (postedAt isn't a
  // registered form field), which blocked Save entirely with zero feedback —
  // this asserts postedAt is dropped rather than ever reaching the popup
  // broken.
  it('drops postedAt entirely when the value cannot be parsed into a valid date (negative case)', async () => {
    tabsQueryMock.mockResolvedValueOnce([{ id: 1, url: 'https://example.com/jobs/1' }]);
    executeScriptMock.mockResolvedValueOnce([
      {
        result: {
          jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' },
          postedAt: { value: {}, confidence: 0.7, source: 'site-adapter' },
        },
      },
    ]);

    const result = await captureActiveTab();

    expect(result.extraction.postedAt).toBeUndefined();
    expect(result.extraction.jobTitle?.value).toBe('Engineer');
  });

  it('throws a CaptureError when there is no active tab (negative case)', async () => {
    tabsQueryMock.mockResolvedValueOnce([]);

    await expect(captureActiveTab()).rejects.toThrow(CaptureError);
  });

  it('throws a CaptureError when injection fails, e.g. on a restricted chrome:// page (negative case)', async () => {
    tabsQueryMock.mockResolvedValueOnce([{ id: 1, url: 'chrome://extensions' }]);
    executeScriptMock.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));

    await expect(captureActiveTab()).rejects.toThrow(CaptureError);
  });
});
