import { defineConfig } from '@playwright/test'

// Electron tests drive the built app via Playwright's _electron API.
// No browsers are downloaded; these run headless-friendly on CI/loops.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list'
})
