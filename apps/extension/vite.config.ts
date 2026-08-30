import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

// The widget bundle (src/widget/content.tsx) is intentionally NOT built
// here — see vite.widget.config.ts for why it needs a fully separate
// Rollup graph. This config now only needs to handle what CRXJS manages
// declaratively: the background service worker (auto-bundled from
// manifest.background.service_worker, no manual rollupOptions needed,
// unlike the widget) and icons/manifest.
export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
});
