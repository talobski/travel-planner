import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  use: { baseURL: "http://localhost:4174" },
  webServer: {
    command: "pnpm exec vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
})
