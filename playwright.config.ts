import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:8794" },
  projects: [
    { name: "integration", testMatch: "api.spec.ts" },
    {
      name: "mobile",
      testMatch: "browser.spec.ts",
      use: { ...devices["Pixel 7"], reducedMotion: "reduce" },
    },
  ],
  webServer: {
    command: "npm run test:serve",
    url: "http://127.0.0.1:8794/api/health",
    reuseExistingServer: false,
    timeout: 90000,
  },
});
