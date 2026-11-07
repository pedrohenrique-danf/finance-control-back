import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL },
  webServer: {
    command: "pnpm dev",
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
  },
});
