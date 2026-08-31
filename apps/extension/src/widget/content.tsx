import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { resolveJobPosting, type ExtractedJobPosting } from '@bewerber/scrapers';
import widgetCss from './index.css?inline';
import { Widget } from './Widget';

// This whole file is what background/index.ts injects on every
// toolbar-icon click via chrome.scripting.executeScript({ files:
// ['widget.js'] }) — fire-and-forget, nobody reads a return value, so
// (unlike the old content-script/index.ts) there's no constraint requiring
// this to be a single top-level expression. Each click is a fresh
// execution of the whole module, so toggle state can't live in a JS
// closure across clicks — only the DOM node this creates persists, which
// is why the toggle check at the bottom of this file looks the host
// element up by a fixed ID rather than tracking any module-level state.
const HOST_ID = 'bewerber-widget-host';

type WidgetHost = HTMLDivElement & { __bewerberUnmount?: () => void };

// Some sites (LinkedIn's job search results among them) swap the job being
// shown via the History API instead of a real navigation — clicking a
// different job in the list changes location.href but never triggers a page
// load, so without this the widget would keep showing whatever job was on
// the page when it was opened. pushState/replaceState don't fire any event
// of their own (unlike back/forward navigation's popstate), so this patches
// them to also dispatch one — doesn't change what the calls do, just adds a
// notification alongside them, a standard technique for detecting SPA
// navigation from outside the app doing it. Patched once per page load
// (guarded on `window`, which — unlike this module — persists across the
// widget being toggled closed and reopened), not once per widget open.
declare global {
  interface Window {
    __bewerberLocationWatcherInstalled?: boolean;
  }
}

// pushState and replaceState share this exact signature — typed explicitly
// as a tuple rather than derived via Parameters<History[method]> from a
// union of the two methods, which TS can't spread (it doesn't collapse to
// a clean tuple type).
type HistoryMutator = (data: unknown, unused: string, url?: string | URL | null) => void;

// Patches History.prototype, not the `history` instance (history.pushState
// = wrapper) — verified live, that instance-level version missed some
// navigations on a real page. A sophisticated SPA router can plausibly call
// `History.prototype.pushState.call(...)` directly, which bypasses an
// own-property override on the instance entirely (own properties shadow
// the prototype only for lookups that go through the instance normally).
// Patching the prototype method itself is what every call — however it's
// invoked — actually runs.
function patchHistoryMethod(method: 'pushState' | 'replaceState') {
  const original: HistoryMutator = History.prototype[method];
  History.prototype[method] = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    original.call(this, data, unused, url);
    window.dispatchEvent(new Event('bewerber:locationchange'));
  } as HistoryMutator;
}

function ensureLocationChangeEvents() {
  if (window.__bewerberLocationWatcherInstalled) return;
  window.__bewerberLocationWatcherInstalled = true;

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  window.addEventListener('popstate', () =>
    window.dispatchEvent(new Event('bewerber:locationchange')),
  );
}

type ExtractResult = { extraction?: ExtractedJobPosting; extractionError?: string };

function extractCurrentPage(): ExtractResult {
  // Runs in the same isolated-world page context content-script/index.ts
  // used to run in via a separate injection step — resolveJobPosting can
  // be called directly here, in-process, with a real Date for postedAt.
  // No chrome.scripting.executeScript result round-trip means no
  // serialization boundary, which is what used to turn that Date into an
  // unrecoverable `{}` and required the ISO-string dance + capture.ts's
  // normalizeExtraction() safety net — neither is needed anymore.
  try {
    return { extraction: resolveJobPosting(location.href, document) };
  } catch {
    return { extractionError: 'Could not read this page. Try a regular job posting page.' };
  }
}

// Sites that render the job detail asynchronously after a route change
// (LinkedIn among them, verified live: navigating to a different job — even
// via a full page load, not just the in-page case handled below — can
// briefly leave the DOM without the job's own content yet, so extraction
// lands on generic fallbacks like the nav bar's "Jobs" link instead of the
// real title, with company/description empty) need a beat before extracting
// for real. No company AND no description is the signal something's still
// missing — not site-specific, just "this doesn't look like a job page yet."
function looksIncomplete(result: ExtractResult): boolean {
  return !result.extraction?.companyName?.value && !result.extraction?.jobDescription?.value;
}

const RETRY_DELAY_MS = 400;
const MAX_RETRY_ATTEMPTS = 6;

// Retries in the background rather than blocking the initial render on it:
// whatever extractCurrentPage() got on the first try is shown immediately
// (usually already correct — this is a fallback for the async-content
// case, not the common path), and silently upgraded if a later attempt
// finds more. `forUrl` guards against a stale retry (still in flight when
// the user navigates again) clobbering a newer, already-current result.
function scheduleExtractionRetry(forUrl: string, onImproved: (result: ExtractResult) => void) {
  let attempt = 0;
  let cancelled = false;

  function tryOnce() {
    if (cancelled || location.href !== forUrl) return;
    attempt += 1;
    const result = extractCurrentPage();
    if (!looksIncomplete(result)) {
      onImproved(result);
      return;
    }
    if (attempt < MAX_RETRY_ATTEMPTS) {
      setTimeout(tryOnce, RETRY_DELAY_MS);
    }
  }

  setTimeout(tryOnce, RETRY_DELAY_MS);
  return () => {
    cancelled = true;
  };
}

const CONTENT_CHANGE_DEBOUNCE_MS = 700;

// A second, independent way of detecting "the job on this page changed" —
// not dependent on the History API at all, unlike handleLocationChange in
// mountWidget below. Verified live: on a real page, at least one job-to-job
// navigation never triggered the pushState/replaceState-based detection (a
// sophisticated SPA router has more than one way to update the URL, and
// there's no guaranteed way to intercept all of them from outside the
// app doing it), while location.href did visibly change in the address
// bar — so it wasn't simply that this particular site skips the History
// API. Watching the DOM directly is what makes detection reliable
// regardless of which mechanism a given site's router happens to use.
// Debounced rather than checked on every mutation: a content swap is
// itself a burst of many DOM mutations, and re-extracting on each one
// would be wasteful and could catch the DOM mid-update.
function watchForContentChange(
  getCurrent: () => ExtractResult,
  onDifferentJobDetected: () => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function checkForChange() {
    const fresh = extractCurrentPage();
    if (looksIncomplete(fresh)) return;
    const current = getCurrent();
    const changed =
      fresh.extraction?.companyName?.value !== current.extraction?.companyName?.value ||
      fresh.extraction?.jobTitle?.value !== current.extraction?.jobTitle?.value;
    if (changed) onDifferentJobDetected();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkForChange, CONTENT_CHANGE_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    clearTimeout(debounceTimer);
    observer.disconnect();
  };
}

function mountWidget() {
  const host: WidgetHost = document.createElement('div');
  host.id = HOST_ID;
  // Open shadow root: isolates the widget's Tailwind styles from the host
  // page's CSS in both directions (nothing in, nothing out).
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = widgetCss;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root: Root = createRoot(mountPoint);

  // Mutable outside-React state, re-rendered into the root on change — the
  // simplest way to bridge a non-React event source (the location-change
  // listener below) into this tree, given the whole widget already boots
  // imperatively like this rather than via a normal ReactDOM.render call
  // inside some larger app.
  let currentUrl = location.href;
  let current = extractCurrentPage();
  let newJobDetected = false;
  let cancelPendingRetry: (() => void) | undefined;

  function render() {
    root.render(
      <StrictMode>
        <Widget
          url={currentUrl}
          extraction={current.extraction}
          extractionError={current.extractionError}
          newJobAvailable={newJobDetected}
          onRefresh={() => {
            cancelPendingRetry?.();
            currentUrl = location.href;
            current = extractCurrentPage();
            newJobDetected = false;
            render();
            if (looksIncomplete(current)) {
              cancelPendingRetry = scheduleExtractionRetry(currentUrl, (improved) => {
                current = improved;
                render();
              });
            }
          }}
          onClose={close}
        />
      </StrictMode>,
    );
  }

  if (looksIncomplete(current)) {
    cancelPendingRetry = scheduleExtractionRetry(currentUrl, (improved) => {
      current = improved;
      render();
    });
  }

  // Deliberately doesn't re-extract or update currentUrl/current yet — just
  // flags that something changed. Refreshing immediately would silently
  // overwrite whatever the user might already be editing in the form for
  // the job currently shown; onRefresh (wired to a button in the banner
  // this flag triggers) is what actually swaps to the new job. Guarded so
  // a second detection (e.g. the content observer firing shortly after the
  // location-change one already did, for the same navigation) doesn't
  // trigger a redundant re-render.
  function flagNewJob() {
    if (newJobDetected) return;
    newJobDetected = true;
    render();
  }

  function handleLocationChange() {
    if (location.href === currentUrl) return;
    flagNewJob();
  }

  const stopWatchingContent = watchForContentChange(() => current, flagNewJob);

  host.__bewerberUnmount = () => {
    cancelPendingRetry?.();
    stopWatchingContent();
    window.removeEventListener('bewerber:locationchange', handleLocationChange);
    root.unmount();
  };

  function close() {
    cancelPendingRetry?.();
    stopWatchingContent();
    window.removeEventListener('bewerber:locationchange', handleLocationChange);
    root.unmount();
    host.remove();
  }

  ensureLocationChangeEvents();
  window.addEventListener('bewerber:locationchange', handleLocationChange);

  render();
  document.body.appendChild(host);
}

// Deliberately run last, not at the top of the file: this calls
// mountWidget() (and, indirectly, scheduleExtractionRetry, which reads the
// RETRY_DELAY_MS/MAX_RETRY_ATTEMPTS consts declared further down) — running
// this before those declarations are reached during top-to-bottom module
// evaluation would hit them still in their temporal dead zone. Function
// declarations above are hoisted, so calling mountWidget() here already
// works regardless; the consts specifically are not.
const existingHost = document.getElementById(HOST_ID) as WidgetHost | null;

if (existingHost) {
  existingHost.__bewerberUnmount?.();
  existingHost.remove();
} else {
  mountWidget();
}
