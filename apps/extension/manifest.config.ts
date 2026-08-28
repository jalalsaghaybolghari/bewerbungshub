import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Bewerbermanagementsystem Capture',
  description: 'Capture the job posting you are viewing and save it to your application tracker.',
  version: pkg.version,
  action: {
    default_popup: 'src/popup/index.html',
  },
  // "storage" for the cached access token, "scripting" + "activeTab" to inject
  // the extraction content script into the current tab on demand (no
  // declarative content_scripts / broad host permissions needed for that).
  permissions: ['activeTab', 'scripting', 'storage'],
  // TODO: point this at the deployed API origin before shipping past dev.
  host_permissions: ['http://localhost:3000/*'],
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});
