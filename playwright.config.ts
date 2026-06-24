import { defineConfig, devices } from "@playwright/test";

// E2E for the Workshops design migration. Runs the real app (next start) and
// drives the auth-gated UI as a seeded test user. Locally you can point at an
// already-running server or a deployed preview via E2E_BASE_URL.
const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
  ],
  // When targeting a remote URL (E2E_BASE_URL), don't manage a local server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${BASE_URL}/login`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
