import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_LOCAL_PREVIEW: "1",
      PLAYWRIGHT_AUTH_LOCAL_PREVIEW: "1",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: ""
    }
  },
  projects: [
    {
      name: "desktop-edge",
      use: {
        ...devices["Desktop Edge"],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: "mobile-edge",
      use: {
        ...devices["Pixel 5"]
      }
    }
  ]
});
