import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const cameraFixture = resolve(repositoryRoot, "tests/browser/public/fixtures/camera-qr.y4m");

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "**/camera-pipeline.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "firefox",
      testIgnore: "**/camera-pipeline.spec.ts",
      use: { browserName: "firefox" },
    },
    {
      name: "webkit",
      testIgnore: "**/camera-pipeline.spec.ts",
      use: { browserName: "webkit" },
    },
    {
      name: "chromium-camera",
      testMatch: "**/camera-pipeline.spec.ts",
      use: {
        browserName: "chromium",
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${cameraFixture}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run test:browser:serve",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
