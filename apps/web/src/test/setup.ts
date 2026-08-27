import '@testing-library/jest-dom/vitest';
import '../i18n';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's automatic afterEach-cleanup relies on detecting a global `afterEach`,
// which we don't have (vitest.config.ts keeps `globals: false` so test files
// import their own vitest APIs explicitly) — so it's registered explicitly here.
afterEach(cleanup);
