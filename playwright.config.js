import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './dist/tests/e2e',
    timeout: 90_000,
    fullyParallel: false,
    workers: 1,
    expect: { timeout: 10_000 },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 1280, height: 720 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'python3 -m http.server 4173 -d dist',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
    },
});
