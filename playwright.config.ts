import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 20_000,
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: "node scripts/e2e-server.mjs backend",
      url: "http://127.0.0.1:3101/api/health",
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: "node scripts/e2e-server.mjs frontend",
      url: "http://127.0.0.1:3100/login",
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
