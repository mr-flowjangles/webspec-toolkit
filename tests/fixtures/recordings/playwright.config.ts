/**
 * Shared Playwright config for running specs rendered from the recordings in
 * this directory. Operators following the README quickstart point `playwright
 * test` at this config so it can resolve relative test paths and behave
 * consistently across the three reference recordings.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'line',
  use: { headless: true },
});
