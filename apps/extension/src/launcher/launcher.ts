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
      padding: 14px 9px;
      /* BewerbungsHub brand indigo (#4f46e5) — kept in sync with
         --color-accent in widget/index.css; this file stays plain CSS
         (no Tailwind/theme import, see the file-level comment above), so
         the value is duplicated here rather than shared. */
      background: rgba(79, 70, 229, 0.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-right: none;
      color: #16233a;
      font: 600 11px/1.2 system-ui, sans-serif;
      letter-spacing: 0.03em;
      border-radius: 0 12px 12px 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      cursor: pointer;
      writing-mode: vertical-rl;
      transform: translateY(-50%) rotate(180deg);
      transition: background-color 0.15s ease;
    }
    button:hover {
      background: rgba(79, 70, 229, 0.55);
    }
  `;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'BewerbungsHub';
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'TOGGLE_WIDGET' });
  });
  shadow.appendChild(button);

  document.body.appendChild(host);
}
