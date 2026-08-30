// Registered declaratively in manifest.config.ts (content_scripts, matches
// <all_urls>), so this runs once on every page load automatically — unlike
// the widget itself, which only ever gets injected on an explicit click
// (background/index.ts's action.onClicked, or a click on the tab this
// file creates). Deliberately dependency-free (no React, no Tailwind, no
// imports from lib/ or widget/): it has to run on every single page this
// browser loads, so it stays a handful of plain DOM calls rather than
// pulling in anything from the ~300KB widget bundle.

const HOST_ID = 'bewerber-launcher-host';
if (!document.getElementById(HOST_ID)) {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    button {
      all: unset;
      position: fixed;
      top: 50%;
      right: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 8px;
      background: #e0a93b;
      color: #16233a;
      font: 600 12px/1.2 system-ui, sans-serif;
      letter-spacing: 0.02em;
      border-radius: 8px 0 0 8px;
      box-shadow: -1px 1px 4px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      writing-mode: vertical-rl;
      transform: translateY(-50%) rotate(180deg);
    }
    button:hover {
      background: #cf9a2f;
    }
  `;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Capture job';
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'TOGGLE_WIDGET' });
  });
  shadow.appendChild(button);

  document.body.appendChild(host);
}
