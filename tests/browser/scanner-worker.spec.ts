import { expect, test } from "@playwright/test";

test("decodes in the production-style inline worker", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__MBS_BROWSER_TEST__?.done, undefined, {
    timeout: 30_000,
  });

  const result = await page.evaluate(() => window.__MBS_BROWSER_TEST__);
  expect(result.error).toBeUndefined();
  expect(result.response).toEqual({
    found: true,
    scannerId: 1,
    sessionId: 1,
    data: {
      typeName: "QRCODE",
      scanData: "modern-browser-worker",
    },
  });
});

declare global {
  interface Window {
    __MBS_BROWSER_TEST__?: {
      done: boolean;
      response?: unknown;
      error?: string;
    };
  }
}
