import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "artifacts/playwright-results",
  use: {
    baseURL: process.env.PLAYTEST_BASE_URL || "http://localhost:5173",
    channel: "chrome",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Map requests contain public SDK credentials: do not retain network traces.
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
});
