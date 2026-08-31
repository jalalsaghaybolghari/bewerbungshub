import { apiFetch, setAccessToken } from './api';
import { ApiError } from '../lib/api-client';
import { enqueue, flushQueue } from './queue';

// The reliable trigger for retrying queued requests: MV3 service workers
// get killed/evicted when idle, so a plain setInterval wouldn't survive —
// an alarm wakes this one back up when it fires. `create` is idempotent
// (recreating an alarm with the same name just resets its schedule), so
// this can run unconditionally on every service worker startup.
chrome.alarms.create('flush-offline-queue', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush-offline-queue') void flushQueue();
});

// A faster secondary trigger for when the service worker happens to
// already be alive — service workers support the same online/offline
// events as a window (NavigatorOnLine is part of the shared
// WorkerGlobalScope/WindowOrWorkerGlobalScope mixin). Not a replacement
// for the alarm above: this only fires if something else already woke the
// worker up around the same time connectivity returned.
self.addEventListener('online', () => void flushQueue());

// Fire-and-forget: widget.js does its own DOM-presence check to decide
// whether to mount or unmount, so there's no toggle state to track here —
// and nothing to track it in, since MV3 service workers get killed/evicted
// between events anyway.
function injectWidget(tabId: number) {
  void chrome.scripting.executeScript({
    target: { tabId },
    files: ['widget.js'],
  });
}

// No default_popup in the manifest, so this fires on every toolbar-icon
// click (the click itself is the user gesture that grants activeTab for
// this tab).
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) injectWidget(tab.id);
});

// The always-on launcher tab (src/launcher/index.ts, present on every page
// via a declarative content script) can't call chrome.scripting itself —
// that API isn't available to content scripts, only to extension pages and
// the background — so it messages this instead.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'TOGGLE_WIDGET' &&
    sender.tab?.id
  ) {
    injectWidget(sender.tab.id);
  }
});

interface ApiFetchMessage {
  type: 'API_FETCH';
  path: string;
  method?: string;
  body?: unknown;
  // Set only by createApplication (see lib/applications.ts) — the one call
  // where losing the data actually matters. A failed duplicate-check or
  // login attempt should just fail normally, not get queued.
  queueOnNetworkFailure?: boolean;
}

type SerializedApiError = {
  ok: false;
  status: number;
  message: string;
  body?: unknown;
};

type QueuedResponse = { queued: true };

function isApiFetchMessage(message: unknown): message is ApiFetchMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'API_FETCH'
  );
}

// The widget (running inside a page like linkedin.com, not a real extension
// context) can't call fetch() against the API directly — since Chrome 73,
// requests from a content script are attributed to the page's own origin
// and get none of host_permissions' cross-origin allowance, so the API's
// CORS policy would block them outright. It also can't reach
// chrome.storage.session, which defaults to excluding content-script
// contexts (deliberately not widened here — that would expose the access
// token to page-world scripts on whatever site the widget is mounted on).
// So the widget messages this listener instead, which runs the actual
// fetch here in the background where both of those are non-issues.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isApiFetchMessage(message)) return;

  (async () => {
    try {
      const data = await apiFetch(message.path, { method: message.method, body: message.body });
      // /auth/login and /auth/logout have a side effect beyond the fetch
      // itself — caching or clearing the access token — that used to live
      // in lib/auth.ts's login()/logout(). That code now runs in the
      // widget, which can't touch chrome.storage.session, so it happens
      // here instead, the one place that can.
      if (message.path === '/auth/login') {
        await setAccessToken((data as { accessToken: string }).accessToken);
      } else if (message.path === '/auth/logout') {
        await setAccessToken(null);
      }
      sendResponse({ ok: true, data });
    } catch (err) {
      if (message.path === '/auth/logout') await setAccessToken(null);

      const isNetworkError = !(err instanceof ApiError);
      if (isNetworkError && message.queueOnNetworkFailure) {
        await enqueue(message.path, message.method ?? 'GET', message.body);
        const response: QueuedResponse = { queued: true };
        sendResponse(response);
        return;
      }

      const serialized: SerializedApiError =
        err instanceof ApiError
          ? { ok: false, status: err.status, message: err.message, body: err.body }
          : { ok: false, status: 0, message: 'Something went wrong.' };
      sendResponse(serialized);
    }
  })();

  // Chrome only keeps the message channel open for an async sendResponse
  // when the listener synchronously returns the literal `true` — an async
  // listener's implicit Promise return doesn't satisfy that check, which is
  // why the actual work above is wrapped in an inner IIFE instead.
  return true;
});
