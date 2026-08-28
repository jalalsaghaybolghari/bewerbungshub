import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: {
    rollupOptions: {
      // CRXJS only auto-bundles HTML-referenced entries and declarative
      // content_scripts — registering the content script as a plain
      // web_accessible_resources path (see manifest.config.ts) makes Chrome
      // allow referencing it, but does NOT make CRXJS bundle it, so its
      // `import` from '@bewerber/scrapers' would ship unresolved. This
      // explicit input gets it through the same TS/ESM bundling as
      // everything else.
      input: {
        'content-script': 'src/content-script/index.ts',
      },
      output: {
        // chrome.scripting.executeScript's `files` option (in
        // src/lib/capture.ts) needs a stable path to reference — the
        // default content-hashed filename changes every build.
        entryFileNames: (chunk) =>
          chunk.name === 'content-script' ? 'content-script.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
