import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'BewerbungsHub Capture',
  description: 'Capture the job posting you are viewing and save it to your application tracker.',
  version: pkg.version,
  // No default_popup: clicking the toolbar icon fires action.onClicked
  // (background/index.ts) instead of opening a dropdown, so it can toggle
  // the floating widget on the page itself. onClicked only fires when
  // there's no declarative popup — this is deliberate, not an oversight.
  action: {},
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  // A small always-on launcher tab (src/launcher/index.ts), docked to the
  // page edge on every site, so opening the widget doesn't require finding
  // the toolbar icon first. This is a real permission-scope decision, not
  // free: unlike the on-demand widget (activeTab-gated, only runs on an
  // explicit click), a declarative content script with a broad `matches`
  // runs on every page load on every site, and Chrome shows that as a
  // broader install-time warning ("Read and change all your data on all
  // websites you visit") than activeTab-only ever required. Confirmed with
  // the user as the wanted tradeoff (they want the tab everywhere, not
  // scoped to just job-posting sites) rather than an oversight.
  content_scripts: [
    {
      matches: ['<all_urls>'],
      // Named launcher.ts, not index.ts, deliberately: CRXJS's manifest
      // rewriting collided when this and background/index.ts both resolved
      // to a chunk named index.ts-<hash>.js — verified live, it wired
      // service-worker-loader.js to import THIS script's bundle instead of
      // the background's, which crashed the service worker outright
      // ("Uncaught ReferenceError: document is not defined", since a
      // service worker has no DOM). A distinct basename avoids the
      // collision rather than working around it after the fact.
      js: ['src/launcher/launcher.ts'],
      run_at: 'document_idle',
    },
  ],
  // "storage" for the cached access token (background-only — see
  // background/api.ts), "scripting" to inject the widget into a tab on
  // demand. "activeTab" alone is NOT enough for that once the launcher tab
  // exists: it only grants chrome.scripting.executeScript access when the
  // triggering gesture is the toolbar icon itself, a context-menu click, or
  // a command shortcut — a click on a button the launcher's content script
  // put on the page does not qualify, even though it's the extension's own
  // UI (verified live: the launcher tab's click did nothing, silently,
  // because of exactly this). <all_urls> host_permissions below covers it
  // persistently instead, for both trigger paths.
  // "alarms" backs the offline retry queue's periodic flush
  // (background/queue.ts) — MV3 service workers don't stay alive for a
  // setInterval to survive, but a chrome.alarms alarm wakes one back up
  // when it fires.
  permissions: ['activeTab', 'scripting', 'storage', 'alarms'],
  // Superset of the API origin this used to list on its own — already
  // covered by <all_urls>, and needed regardless now (see above), so it's
  // not listed separately anymore.
  host_permissions: ['<all_urls>'],
  // The widget's injected bundle (src/widget/content.tsx, built to a stable
  // widget.js — see vite.config.ts) is deliberately NOT declared here as a
  // content_scripts entry — chrome.scripting.executeScript (triggered by
  // either the toolbar icon or the launcher tab) just needs the built file
  // to exist in the packaged extension, no web_accessible_resources entry
  // needed either (that mechanism is for exposing files to web-page-context
  // JS, not the extension's own executeScript calls).
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});
