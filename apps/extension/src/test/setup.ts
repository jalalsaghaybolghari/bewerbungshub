import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

const sessionStore = new Map<string, unknown>();

// jsdom has no chrome.* extension APIs — stub just what each context needs.
// storage.session is only ever touched by background/api.ts now (the
// widget can't reach it); runtime.sendMessage/onMessage is the
// widget<->background bridge (lib/messenger.ts, background/index.ts);
// scripting.executeScript + action.onClicked back the toolbar-click toggle
// (background/index.ts).
Object.assign(globalThis, {
  chrome: {
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: sessionStore.get(key) })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) sessionStore.set(key, value);
        }),
        remove: vi.fn(async (key: string) => {
          sessionStore.delete(key);
        }),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: vi.fn(),
    },
    action: {
      onClicked: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn(),
    },
  },
});

afterEach(() => {
  sessionStore.clear();
});
