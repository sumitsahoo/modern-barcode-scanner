import { expect, test, type Page } from "@playwright/test";

const viewports = {
  desktop: { width: 1440, height: 900 },
  compact: { width: 320, height: 568 },
  mobile: { width: 375, height: 667 },
  portrait: { width: 414, height: 896 },
  tablet: { width: 768, height: 1024 },
  landscape: { width: 844, height: 390 },
} as const;

const hallmarkViewports = [
  viewports.compact,
  viewports.mobile,
  viewports.portrait,
  viewports.tablet,
  viewports.desktop,
] as const;

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
};

test("visual audit cards fit desktop and mobile viewports", async ({ page }) => {
  for (const viewport of hallmarkViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?visual-audit");

    const cards = page.locator(".visual-audit-card");
    const iconItems = page.locator(".visual-audit-icon-item");
    await expect(cards).toHaveCount(7);
    await expect(iconItems).toHaveCount(10);
    await expectNoHorizontalOverflow(page);

    const cardEdges = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const rectangle = element.getBoundingClientRect();
        return { left: rectangle.left, right: rectangle.right };
      }),
    );

    for (const edge of cardEdges) {
      expect(edge.left).toBeGreaterThanOrEqual(0);
      expect(edge.right).toBeLessThanOrEqual(viewport.width);
    }

    const iconStyles = await iconItems.locator("svg").evaluateAll((icons) =>
      icons.map((icon) => ({
        stroke: icon.getAttribute("stroke"),
        strokeWidth: icon.getAttribute("stroke-width"),
        viewBox: icon.getAttribute("viewBox"),
      })),
    );
    expect(iconStyles).toEqual(
      iconStyles.map(() => ({ stroke: "currentColor", strokeWidth: "1.75", viewBox: "0 0 24 24" })),
    );
  }
});

test("every demo state remains legible and contained at Hallmark breakpoints", async ({ page }) => {
  const states = ["idle", "starting", "active", "result", "error"] as const;

  for (const viewport of hallmarkViewports) {
    await page.setViewportSize(viewport);

    for (const state of states) {
      await page.goto(`/visual.html?demo-state=${state}`);
      await expectNoHorizontalOverflow(page);

      const pageDimensions = await page.evaluate(() => ({
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      expect(pageDimensions.scrollHeight).toBe(pageDimensions.clientHeight);

      const visibleButtons = page.locator("button:visible");
      const buttonStyles = await visibleButtons.evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return {
            height: box.height,
            text: button.textContent?.trim() ?? "",
            whiteSpace: getComputedStyle(button).whiteSpace,
            width: box.width,
            x: box.x,
            y: box.y,
          };
        }),
      );

      for (const button of buttonStyles) {
        expect(button.height).toBeGreaterThanOrEqual(44);
        if (button.text) expect(button.whiteSpace).toBe("nowrap");
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.y).toBeGreaterThanOrEqual(0);
        expect(button.x + button.width).toBeLessThanOrEqual(viewport.width);
        expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
      }

      if (state === "idle") {
        await expect(page.getByText("Scan when ready.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Start scanning" })).toContainText(
          "Start scan",
        );
      } else if (state === "starting") {
        await expect(page.getByText("Starting camera", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Cancel camera" })).toContainText("Cancel");
      } else if (state === "active") {
        await expect(page.getByText("Camera on", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Stop scanning" })).toContainText(
          "Stop scan",
        );
      } else if (state === "result") {
        await expect(page.getByRole("dialog", { name: "QR code" })).toBeVisible();
      } else {
        const alert = page.getByRole("alert");
        await expect(alert).toBeVisible();
        await expect(alert).toContainText("Scanning paused");
        await expect(alert).not.toContainText("1359896");
      }
    }
  }
});

test("active scanner controls remain usable in portrait and short landscape layouts", async ({
  page,
}) => {
  for (const viewport of [viewports.portrait, viewports.landscape]) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?demo-state=active");
    await expectNoHorizontalOverflow(page);

    const pageDimensions = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(pageDimensions.scrollHeight).toBe(pageDimensions.clientHeight);

    for (const accessibleName of ["Stop scanning", "Switch camera", "Turn on torch"]) {
      const control = page.getByRole("button", { name: accessibleName });
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }

    const stopButton = await page.getByRole("button", { name: "Stop scanning" }).boundingBox();
    const cameraControls = await page.getByRole("group", { name: "Camera controls" }).boundingBox();
    expect(stopButton).not.toBeNull();
    expect(cameraControls).not.toBeNull();
    const controlsOverlap =
      stopButton!.x < cameraControls!.x + cameraControls!.width &&
      stopButton!.x + stopButton!.width > cameraControls!.x &&
      stopButton!.y < cameraControls!.y + cameraControls!.height &&
      stopButton!.y + stopButton!.height > cameraControls!.y;
    expect(controlsOverlap).toBe(false);
  }
});

test("viewfinder uses balanced technical brackets without leaving the viewport", async ({
  page,
}) => {
  for (const viewport of [viewports.compact, viewports.landscape, viewports.desktop]) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?demo-state=active");

    const metrics = await page.locator(".mbs-viewfinder-frame").evaluate((frame) => {
      const rectangle = frame.getBoundingClientRect();
      const frameStyles = getComputedStyle(frame);
      const corners = getComputedStyle(frame, "::before").backgroundImage;
      const calibrationTicks = getComputedStyle(frame, "::after").backgroundImage;
      const scanLine = getComputedStyle(frame.querySelector(".mbs-scan-line")!);

      return {
        bottom: rectangle.bottom,
        borderWidth: frameStyles.borderTopWidth,
        calibrationTickCount: calibrationTicks.match(/linear-gradient/g)?.length ?? 0,
        cornerSegmentCount: corners.match(/linear-gradient/g)?.length ?? 0,
        left: rectangle.left,
        right: rectangle.right,
        scanLineHeight: scanLine.height,
        top: rectangle.top,
      };
    });

    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(viewport.width);
    expect(metrics.bottom).toBeLessThanOrEqual(viewport.height);
    expect(metrics.borderWidth).toBe("1px");
    expect(metrics.cornerSegmentCount).toBe(8);
    expect(metrics.calibrationTickCount).toBe(4);
    expect(metrics.scanLineHeight).toBe("1px");
  }
});

test("result dialog fits a compact viewport and traps keyboard focus", async ({ page }) => {
  await page.setViewportSize(viewports.compact);
  await page.goto("/visual.html?demo-state=result");

  const dialog = page.getByRole("dialog", { name: "QR code" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy result" })).toBeFocused();
  await expectNoHorizontalOverflow(page);

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewports.compact.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewports.compact.height);

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Copy result" })).toBeFocused();
});

test("dark reduced-motion mode disables every scan-line animation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize(viewports.portrait);
  await page.goto("/visual.html?demo-state=active");

  const preferences = await page.evaluate(() => ({
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    backgroundColor: getComputedStyle(document.querySelector(".demo-app")!).backgroundColor,
    animations: [
      ...document.querySelectorAll(
        ".mbs-scan-line-indicator, .mbs-scan-line-trail-down, .mbs-scan-line-trail-up",
      ),
    ].map((element) => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration,
        animationName: styles.animationName,
      };
    }),
  }));

  expect(preferences.dark).toBe(true);
  expect(preferences.reducedMotion).toBe(true);
  expect(preferences.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(preferences.animations).toHaveLength(3);
  expect(preferences.animations).toEqual(
    preferences.animations.map(() => ({ animationDuration: "0s", animationName: "none" })),
  );
});
