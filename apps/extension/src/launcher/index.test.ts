import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
  vi.mocked(chrome.runtime.sendMessage).mockReset();
});

describe('launcher content script', () => {
  it('mounts a shadow-DOM tab with a clickable button (happy path)', async () => {
    await import('./index');

    const host = document.getElementById('bewerber-launcher-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('button')).not.toBeNull();
  });

  it('sends a TOGGLE_WIDGET message when clicked (happy path)', async () => {
    await import('./index');

    const button = document
      .getElementById('bewerber-launcher-host')
      ?.shadowRoot?.querySelector('button');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'TOGGLE_WIDGET' });
  });

  it('does not mount a second tab if the script runs again on the same page (edge case)', async () => {
    await import('./index');
    vi.resetModules();
    await import('./index');

    expect(document.body.querySelectorAll('#bewerber-launcher-host').length).toBe(1);
  });
});
