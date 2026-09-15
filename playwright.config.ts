import { defineConfig } from '@playwright/test';

const GL_ARGS = ['--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173/' },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: GL_ARGS },
      },
      testIgnore: /unsupported/,
    },
    {
      name: 'mobile-emu',
      use: {
        browserName: 'chromium',
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        launchOptions: { args: GL_ARGS },
      },
      testIgnore: /unsupported|first-load/,
    },
    {
      name: 'no-webgl',
      use: {
        browserName: 'chromium',
        launchOptions: { args: ['--disable-webgl'] },
      },
      testMatch: /unsupported/,
    },
  ],
});
