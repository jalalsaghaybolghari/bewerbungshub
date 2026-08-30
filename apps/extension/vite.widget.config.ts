import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The widget is injected via chrome.scripting.executeScript's `files`
// option (background/index.ts), which always runs the file as a classic
// script, never as an ES module — so it cannot contain a top-level
// `import`/`export` statement. Building it as part of the main CRXJS
// build (vite.config.ts) let Rollup notice that src/lib/api-client.ts is
// also imported by the background service worker and split it into a
// shared chunk pulled in via `import` — verified live on a real LinkedIn
// page: "Uncaught SyntaxError: Cannot use import statement outside a
// module". Building the widget in a fully separate Vite/Rollup graph,
// with no other entry point for anything to be shared with, and
// `format: 'iife'` (which cannot emit `import`/`export` at all — Rollup
// bundles every dependency, including React itself, straight into the
// one file), makes that impossible rather than just unlikely.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    // The main build (vite.config.ts, runs first — see package.json's
    // build script) already populated dist/ with the manifest, icons, and
    // background bundle; this just adds widget.js alongside them.
    emptyOutDir: false,
    rollupOptions: {
      input: { widget: 'src/widget/content.tsx' },
      output: {
        format: 'iife',
        // chrome.scripting.executeScript's `files` option needs a stable
        // path to reference (background/index.ts) — the default
        // content-hashed filename changes every build.
        entryFileNames: 'widget.js',
      },
    },
  },
});
