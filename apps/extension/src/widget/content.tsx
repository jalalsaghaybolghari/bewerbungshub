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
// is why the toggle check below looks the host element up by a fixed ID
// rather than tracking any module-level state.
const HOST_ID = 'bewerber-widget-host';

type WidgetHost = HTMLDivElement & { __bewerberUnmount?: () => void };

const existingHost = document.getElementById(HOST_ID) as WidgetHost | null;

if (existingHost) {
  existingHost.__bewerberUnmount?.();
  existingHost.remove();
} else {
  mountWidget();
}

function mountWidget() {
  // Runs in the same isolated-world page context content-script/index.ts
  // used to run in via a separate injection step — resolveJobPosting can
  // be called directly here, in-process, with a real Date for postedAt.
  // No chrome.scripting.executeScript result round-trip means no
  // serialization boundary, which is what used to turn that Date into an
  // unrecoverable `{}` and required the ISO-string dance + capture.ts's
  // normalizeExtraction() safety net — neither is needed anymore.
  let extraction: ExtractedJobPosting | undefined;
  let extractionError: string | undefined;
  try {
    extraction = resolveJobPosting(location.href, document);
  } catch {
    extractionError = 'Could not read this page. Try a regular job posting page.';
  }

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
  host.__bewerberUnmount = () => root.unmount();

  function close() {
    root.unmount();
    host.remove();
  }

  root.render(
    <StrictMode>
      <Widget
        url={location.href}
        extraction={extraction}
        extractionError={extractionError}
        onClose={close}
      />
    </StrictMode>,
  );

  document.body.appendChild(host);
}
