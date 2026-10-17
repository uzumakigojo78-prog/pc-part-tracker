import { defineConfig, devices } from '@playwright/test'

// Separate build dir (dist-e2e) pointed at fixture data, so the e2e build never leaks into the deployed dist/.
const serve = [
  'tsc -b',
  'VITE_DATA_URL=./e2e-data/ vite build --outDir dist-e2e --emptyOutDir',
  'cp -r e2e/fixtures/data dist-e2e/e2e-data',
  'vite preview --outDir dist-e2e --port 4173 --strictPort',
].join(' && ')

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/', trace: 'retain-on-failure' },
  // iPhone 13 viewport/UA/touch, run on chromium (only chromium is installed locally and in CI).
  projects: [{ name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
  webServer: { command: serve, url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI, timeout: 180_000 },
})
