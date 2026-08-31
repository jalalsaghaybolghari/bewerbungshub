import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveJobPostingMock = vi.fn();
vi.mock('@bewerber/scrapers', () => ({
  resolveJobPosting: (...args: unknown[]) => resolveJobPostingMock(...args),
}));

vi.mock('./index.css?inline', () => ({ default: '/* widget styles */' }));

const widgetPropsSpy = vi.fn();
// content.tsx's location-change listener lives on `window`, which (unlike
// this test module) persists across tests in the same file — a test that
// doesn't itself close the widget would otherwise leak a listener that
// fires on a later test's history.pushState and pollutes its call count.
// Capturing the latest onClose and calling it in afterEach keeps every
// test's widget instance cleaned up regardless of what the test itself did.
let lastOnClose: (() => void) | undefined;
vi.mock('./Widget', () => ({
  Widget: (props: { onClose?: () => void }) => {
    widgetPropsSpy(props);
    lastOnClose = props.onClose;
    return null;
  },
}));

// content.tsx patches History.prototype.pushState/replaceState (not the
// `history` instance — see the comment in content.tsx for why), guarded by
// a flag on `window` so it survives the widget being toggled closed and
// reopened within one page load. Both of those persist across tests in
// this shared jsdom window unless reset. Restoring the *prototype* methods
// specifically matters here: resetting via an instance-level assignment
// (history.pushState = original) would create an own property that shadows
// whatever a later test's ensureLocationChangeEvents() patches onto the
// prototype, silently breaking every test after the first.
const originalPushState = History.prototype.pushState;
const originalReplaceState = History.prototype.replaceState;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
  resolveJobPostingMock.mockReset();
  widgetPropsSpy.mockReset();
  History.prototype.pushState = originalPushState;
  History.prototype.replaceState = originalReplaceState;
  delete (window as unknown as { __bewerberLocationWatcherInstalled?: boolean })
    .__bewerberLocationWatcherInstalled;
  lastOnClose = undefined;
  // location.href itself also persists across tests in this shared jsdom
  // window — without resetting it, a test whose own pushState call happens
  // to match wherever an earlier test last navigated to would look like a
  // no-op to content.tsx's `location.href === currentUrl` check and never
  // fire the change it's supposed to.
  originalPushState.call(history, {}, '', '/');
});

afterEach(() => {
  try {
    lastOnClose?.();
  } catch {
    // Already closed/unmounted by the test itself — fine, that's a no-op.
  }
});

describe('widget content script', () => {
  it('mounts a shadow-DOM host and passes the extraction to Widget on first injection (happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' },
    });

    await import('./content');

    const host = document.getElementById('bewerber-widget-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    // createRoot's initial render isn't necessarily flushed synchronously
    // within the same microtask as the import, and StrictMode
    // double-invokes it in development — assert on the latest call rather
    // than an exact count.
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extraction: { jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' } },
    });
  });

  it('removes the host on a second injection instead of mounting a second one (toggle off, happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({});

    await import('./content');
    expect(document.getElementById('bewerber-widget-host')).not.toBeNull();

    vi.resetModules();
    await import('./content');

    expect(document.getElementById('bewerber-widget-host')).toBeNull();
  });

  it('the onClose handler passed to Widget also unmounts and removes the host (happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({});
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    const props = widgetPropsSpy.mock.calls.at(-1)?.[0] as { onClose: () => void };
    props.onClose();

    expect(document.getElementById('bewerber-widget-host')).toBeNull();
  });

  it('passes an error to Widget instead of throwing when extraction fails (negative case)', async () => {
    resolveJobPostingMock.mockImplementation(() => {
      throw new Error('boom');
    });

    await import('./content');

    expect(document.getElementById('bewerber-widget-host')).not.toBeNull();
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extractionError: 'Could not read this page. Try a regular job posting page.',
    });
  });

  it('flags a new job (without re-extracting yet) when the page navigates via pushState (happy path)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Old Job', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    const callsBefore = widgetPropsSpy.mock.calls.length;

    history.pushState({}, '', '/jobs/view/999');

    await vi.waitFor(() => expect(widgetPropsSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as {
      newJobAvailable?: boolean;
      extraction?: { jobTitle?: { value: string } };
    };
    expect(latest.newJobAvailable).toBe(true);
    expect(latest.extraction?.jobTitle?.value).toBe('Old Job');
    expect(resolveJobPostingMock).toHaveBeenCalledTimes(1);
  });

  it('also detects replaceState navigation (edge case)', async () => {
    resolveJobPostingMock.mockReturnValue({});
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    const callsBefore = widgetPropsSpy.mock.calls.length;

    history.replaceState({}, '', '/jobs/view/888');

    await vi.waitFor(() => expect(widgetPropsSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as { newJobAvailable?: boolean };
    expect(latest.newJobAvailable).toBe(true);
  });

  it('onRefresh re-extracts and swaps to the new job, clearing the banner (happy path)', async () => {
    resolveJobPostingMock.mockReturnValueOnce({
      jobTitle: { value: 'Old Job', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    resolveJobPostingMock.mockReturnValueOnce({
      jobTitle: { value: 'New Job', confidence: 0.9, source: 'json-ld' },
    });
    history.pushState({}, '', '/jobs/view/999');
    await vi.waitFor(() => {
      const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as { newJobAvailable?: boolean };
      expect(latest.newJobAvailable).toBe(true);
    });

    const props = widgetPropsSpy.mock.calls.at(-1)?.[0] as { onRefresh: () => void };
    props.onRefresh();

    await vi.waitFor(() => {
      const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as {
        newJobAvailable?: boolean;
        extraction?: { jobTitle?: { value: string } };
      };
      expect(latest.newJobAvailable).toBe(false);
      expect(latest.extraction?.jobTitle?.value).toBe('New Job');
    });
    expect(resolveJobPostingMock).toHaveBeenCalledTimes(2);
  });

  it('silently retries and upgrades the render when the first extraction looks incomplete (happy path)', async () => {
    // No companyName/jobDescription — e.g. LinkedIn's async job-detail
    // content hadn't rendered into the DOM yet at extraction time, so this
    // fell back to whatever generic text was already on the page.
    resolveJobPostingMock
      .mockReturnValueOnce({ jobTitle: { value: 'Jobs', confidence: 0.3, source: 'heuristic' } })
      .mockReturnValueOnce({
        jobTitle: { value: 'Engineer', confidence: 0.9, source: 'json-ld' },
        companyName: { value: 'Acme', confidence: 0.9, source: 'json-ld' },
      });

    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extraction: { jobTitle: { value: 'Jobs' } },
    });

    await vi.waitFor(
      () => {
        const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as {
          extraction?: { companyName?: { value: string } };
        };
        expect(latest.extraction?.companyName?.value).toBe('Acme');
      },
      { timeout: 1000 },
    );
    expect(resolveJobPostingMock).toHaveBeenCalledTimes(2);
  });

  it('gives up retrying after the max attempts and keeps the last (still incomplete) result (negative case)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Jobs', confidence: 0.3, source: 'heuristic' },
    });

    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());
    const callsAtMount = resolveJobPostingMock.mock.calls.length;

    // 6 retries, ~400ms apart, then it stops. Allows for one extra call
    // beyond that: watchForContentChange (a separate detection mechanism)
    // can also fire once from the mount's own DOM setup mutations, which
    // isn't what this test is about — it's checking the *retry loop*
    // specifically caps out rather than retrying forever.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const extraCalls = resolveJobPostingMock.mock.calls.length - callsAtMount;
    expect(extraCalls).toBeGreaterThanOrEqual(6);
    expect(extraCalls).toBeLessThanOrEqual(7);
    expect(widgetPropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      extraction: { jobTitle: { value: 'Jobs' } },
    });
  }, 8000);

  it('onRefresh also retries in the background if the refreshed extraction looks incomplete (edge case)', async () => {
    resolveJobPostingMock.mockReturnValueOnce({
      jobTitle: { value: 'Old Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'Old Co', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    resolveJobPostingMock
      .mockReturnValueOnce({ jobTitle: { value: 'Jobs', confidence: 0.3, source: 'heuristic' } })
      .mockReturnValueOnce({
        jobTitle: { value: 'New Job', confidence: 0.9, source: 'json-ld' },
        companyName: { value: 'New Co', confidence: 0.9, source: 'json-ld' },
      });
    history.pushState({}, '', '/jobs/view/999');
    await vi.waitFor(() => {
      const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as { newJobAvailable?: boolean };
      expect(latest.newJobAvailable).toBe(true);
    });

    const props = widgetPropsSpy.mock.calls.at(-1)?.[0] as { onRefresh: () => void };
    props.onRefresh();

    await vi.waitFor(
      () => {
        const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as {
          extraction?: { companyName?: { value: string } };
        };
        expect(latest.extraction?.companyName?.value).toBe('New Co');
      },
      { timeout: 1000 },
    );
  });

  it('detects a content swap that never touches the URL, via DOM mutations (edge case)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Old Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'Old Co', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'New Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'New Co', confidence: 0.9, source: 'json-ld' },
    });
    // A DOM mutation with no location change at all — location.href stays
    // whatever it already was, which is the scenario the History-API-based
    // detection can't see by design (some SPA routers have more than one
    // way to change the URL, verified live not every path on a real page
    // goes through pushState/replaceState the way our patch expects).
    document.body.appendChild(document.createElement('div'));

    await vi.waitFor(
      () => {
        const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as { newJobAvailable?: boolean };
        expect(latest.newJobAvailable).toBe(true);
      },
      { timeout: 1500 },
    );
  });

  it('does not flag a new job when a DOM mutation does not actually change the extracted job (negative case)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Same Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'Same Co', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    document.body.appendChild(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 900));

    const latest = widgetPropsSpy.mock.calls.at(-1)?.[0] as { newJobAvailable?: boolean };
    expect(latest.newJobAvailable).toBeFalsy();
  });

  it('stops watching for navigation (both the URL and the DOM) once closed (negative case)', async () => {
    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'Co', confidence: 0.9, source: 'json-ld' },
    });
    await import('./content');
    await vi.waitFor(() => expect(widgetPropsSpy).toHaveBeenCalled());

    const props = widgetPropsSpy.mock.calls.at(-1)?.[0] as { onClose: () => void };
    props.onClose();
    const callsAfterClose = widgetPropsSpy.mock.calls.length;

    resolveJobPostingMock.mockReturnValue({
      jobTitle: { value: 'Different Job', confidence: 0.9, source: 'json-ld' },
      companyName: { value: 'Different Co', confidence: 0.9, source: 'json-ld' },
    });
    history.pushState({}, '', '/jobs/view/999');
    document.body.appendChild(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(widgetPropsSpy.mock.calls.length).toBe(callsAfterClose);
  });
});
