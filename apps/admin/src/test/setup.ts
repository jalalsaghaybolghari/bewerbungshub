import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's automatic afterEach-cleanup relies on detecting a global `afterEach`,
// which we don't have (globals: false) — registered explicitly here.
afterEach(cleanup);
