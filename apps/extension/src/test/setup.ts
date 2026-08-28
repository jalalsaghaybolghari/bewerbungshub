import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

const sessionStore = new Map<string, unknown>();

// jsdom has no chrome.* extension APIs — stub just what api-client.ts needs.
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
  },
});

afterEach(() => {
  sessionStore.clear();
});
