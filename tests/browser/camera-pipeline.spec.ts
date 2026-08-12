import { expect, test } from "@playwright/test";

test("decodes through the complete fake-camera pipeline", async ({ page }) => {
  await page.goto("/camera.html");
  await page.waitForFunction(() => window.__MBS_CAMERA_TEST__?.done, undefined, {
    timeout: 30_000,
  });

  const state = await page.evaluate(() => window.__MBS_CAMERA_TEST__);
  expect(state.error).toBeUndefined();
  expect(state.result).toEqual({
    typeName: "QRCODE",
    scanData: "modern-browser-worker",
  });
});

declare global {
  interface Window {
    __MBS_CAMERA_TEST__?: {
      done: boolean;
      result?: unknown;
      error?: string;
    };
  }
}
