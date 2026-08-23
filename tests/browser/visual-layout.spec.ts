import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

const viewports = {
  desktop: { width: 1440, height: 900 },
  compactDesktop: { width: 1280, height: 800 },
  largeDesktop: { width: 1920, height: 1080 },
  narrowLandscape: { width: 568, height: 320 },
  shortMobile: { width: 320, height: 480 },
  ultraShortMobile: { width: 320, height: 360 },
  compact: { width: 320, height: 568 },
  mobile: { width: 375, height: 667 },
  portrait: { width: 414, height: 896 },
  tablet: { width: 768, height: 1024 },
  landscape: { width: 844, height: 390 },
} as const;

const hallmarkViewports = [
  viewports.shortMobile,
  viewports.compact,
  viewports.mobile,
  viewports.portrait,
  viewports.tablet,
  viewports.landscape,
  viewports.compactDesktop,
  viewports.desktop,
  viewports.largeDesktop,
] as const;

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
};

const rectanglesOverlap = (
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const expectContained = (
  rectangle: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) => {
  expect(rectangle.x).toBeGreaterThanOrEqual(0);
  expect(rectangle.y).toBeGreaterThanOrEqual(0);
  expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(viewport.width);
  expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(viewport.height);
};

const setRootTextScale = (page: Page, percentage: number) =>
  page.evaluate((scale) => {
    document.documentElement.style.fontSize = `${scale}%`;
  }, percentage);

const countPixels = (
  image: PNG,
  bounds: { bottom: number; left: number; right: number; top: number },
  matches: (red: number, green: number, blue: number, alpha: number) => boolean,
) => {
  let total = 0;
  for (let y = Math.max(0, bounds.top); y < Math.min(image.height, bounds.bottom); y += 1) {
    for (let x = Math.max(0, bounds.left); x < Math.min(image.width, bounds.right); x += 1) {
      const offset = (image.width * y + x) * 4;
      if (
        matches(
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
          image.data[offset + 3],
        )
      ) {
        total += 1;
      }
    }
  }
  return total;
};

const captureViewfinder = async (page: Page) => {
  const box = await page.locator(".mbs-viewfinder-frame").boundingBox();
  expect(box).not.toBeNull();

  const clip = {
    x: Math.floor(box!.x - 3),
    y: Math.floor(box!.y - 3),
    width: Math.ceil(box!.width + 6),
    height: Math.ceil(box!.height + 6),
  };
  return PNG.sync.read(await page.screenshot({ animations: "disabled", clip }));
};

const captureScanLineBand = async (page: Page) => {
  const box = await page.locator(".mbs-scan-line").boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();

  const left = Math.max(0, Math.floor(box!.x));
  const top = Math.max(0, Math.floor(box!.y - 3));
  const right = Math.min(viewport!.width, Math.ceil(box!.x + box!.width));
  const bottom = Math.min(viewport!.height, Math.ceil(box!.y + box!.height + 3));

  return PNG.sync.read(
    await page.screenshot({
      animations: "disabled",
      clip: { x: left, y: top, width: right - left, height: bottom - top },
    }),
  );
};

const cornerArmBounds = (image: PNG) => {
  const arm = Math.min(48, Math.floor(Math.min(image.width, image.height) / 3));
  const rail = 12;
  return [
    { left: 0, top: 0, right: arm, bottom: rail },
    { left: 0, top: 0, right: rail, bottom: arm },
    { left: image.width - arm, top: 0, right: image.width, bottom: rail },
    { left: image.width - rail, top: 0, right: image.width, bottom: arm },
    { left: 0, top: image.height - rail, right: arm, bottom: image.height },
    { left: 0, top: image.height - arm, right: rail, bottom: image.height },
    {
      left: image.width - arm,
      top: image.height - rail,
      right: image.width,
      bottom: image.height,
    },
    {
      left: image.width - rail,
      top: image.height - arm,
      right: image.width,
      bottom: image.height,
    },
  ];
};

test("visual audit cards fit desktop and mobile viewports", async ({ page }) => {
  for (const viewport of hallmarkViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?visual-audit");

    const cards = page.locator(".visual-audit-card");
    const iconItems = page.locator(".visual-audit-icon-item");
    await expect(cards).toHaveCount(7);
    await expect(iconItems).toHaveCount(9);
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

test("scanner geometry follows its host instead of the desktop viewport", async ({ page }) => {
  await page.setViewportSize(viewports.desktop);
  await page.goto("/visual.html?visual-audit");

  const stage = page.locator(".visual-audit-stage.is-active").first();
  const frame = stage.locator(".mbs-viewfinder-frame");

  for (const width of [250, 320, 480]) {
    await stage.evaluate((element, hostWidth) => {
      Object.assign((element as HTMLElement).style, {
        height: "600px",
        left: "0",
        position: "fixed",
        top: "0",
        width: `${hostWidth}px`,
        zIndex: "1000",
      });
    }, width);

    const stageBox = await stage.boundingBox();
    const frameBox = await frame.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(frameBox).not.toBeNull();
    expect(frameBox!.width).toBeGreaterThanOrEqual(width - 40);
    expect(frameBox!.x).toBeGreaterThanOrEqual(stageBox!.x);
    expect(frameBox!.x + frameBox!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width);
    expect(frameBox!.y).toBeGreaterThanOrEqual(stageBox!.y);
    expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height);
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

test("active scanner controls remain usable in short portrait and landscape layouts", async ({
  page,
}) => {
  for (const viewport of [
    viewports.ultraShortMobile,
    viewports.shortMobile,
    viewports.portrait,
    viewports.landscape,
  ]) {
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
    const viewfinder = await page.locator(".mbs-viewfinder-frame").boundingBox();
    expect(stopButton).not.toBeNull();
    expect(cameraControls).not.toBeNull();
    expect(viewfinder).not.toBeNull();
    expect(rectanglesOverlap(stopButton!, cameraControls!)).toBe(false);

    for (const overlay of [
      await page.locator(".demo-header").boundingBox(),
      await page.locator(".demo-theme-control").boundingBox(),
      stopButton,
      cameraControls,
    ]) {
      expect(overlay).not.toBeNull();
      expect(rectanglesOverlap(viewfinder!, overlay!)).toBe(false);
    }

    const hint = await page.locator(".mbs-viewfinder-hint").boundingBox();
    const header = await page.locator(".demo-header").boundingBox();
    const themeControl = await page.locator(".demo-theme-control").boundingBox();
    expect(hint).not.toBeNull();
    expect(header).not.toBeNull();
    expect(themeControl).not.toBeNull();
    expect(rectanglesOverlap(hint!, header!)).toBe(false);
    expect(rectanglesOverlap(hint!, themeControl!)).toBe(false);

    if (viewport === viewports.shortMobile) {
      expect(stopButton!.y - (viewfinder!.y + viewfinder!.height)).toBeGreaterThanOrEqual(12);
    }

    if (viewport === viewports.landscape) {
      const hintSurface = await page.locator(".mbs-viewfinder-hint").evaluate((element) => {
        const styles = getComputedStyle(element);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context is unavailable");
        context.fillStyle = styles.backgroundColor;
        context.fillRect(0, 0, 1, 1);

        return {
          backgroundColor: styles.backgroundColor,
          surfaceAlpha: context.getImageData(0, 0, 1, 1).data[3],
          zIndex: styles.zIndex,
        };
      });
      expect(hintSurface.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(hintSurface.surfaceAlpha).toBe(255);
      expect(Number(hintSurface.zIndex)).toBeGreaterThan(1);
    }
  }
});

test("active overlays remain separated through 200% text sizing", async ({ page }) => {
  const scaledViewports = [
    viewports.ultraShortMobile,
    viewports.shortMobile,
    viewports.mobile,
    viewports.narrowLandscape,
    viewports.landscape,
    viewports.desktop,
  ];

  for (const viewport of scaledViewports) {
    await page.setViewportSize(viewport);

    for (const textScale of [125, 150, 200]) {
      await page.goto("/visual.html?demo-state=active");
      await setRootTextScale(page, textScale);

      const elements = {
        camera: page.getByRole("group", { name: "Camera controls" }),
        frame: page.locator(".mbs-viewfinder-frame"),
        header: page.locator(".demo-header"),
        hint: page.locator(".mbs-viewfinder-hint"),
        stop: page.getByRole("button", { name: "Stop scanning" }),
        theme: page.locator(".demo-theme-control"),
      };
      const boxes = {
        camera: await elements.camera.boundingBox(),
        frame: await elements.frame.boundingBox(),
        header: await elements.header.boundingBox(),
        hint: await elements.hint.boundingBox(),
        stop: await elements.stop.boundingBox(),
        theme: await elements.theme.boundingBox(),
      };

      for (const box of [boxes.camera, boxes.frame, boxes.header, boxes.stop, boxes.theme]) {
        expect(box).not.toBeNull();
        expectContained(box!, viewport);
      }

      expect(rectanglesOverlap(boxes.header!, boxes.theme!)).toBe(false);
      expect(rectanglesOverlap(boxes.header!, boxes.frame!)).toBe(false);
      expect(rectanglesOverlap(boxes.theme!, boxes.frame!)).toBe(false);
      expect(rectanglesOverlap(boxes.stop!, boxes.frame!)).toBe(false);
      expect(rectanglesOverlap(boxes.camera!, boxes.frame!)).toBe(false);
      expect(rectanglesOverlap(boxes.stop!, boxes.camera!)).toBe(false);

      if (await elements.hint.isVisible()) {
        expect(boxes.hint).not.toBeNull();
        expectContained(boxes.hint!, viewport);
        expect(rectanglesOverlap(boxes.hint!, boxes.header!)).toBe(false);
        expect(rectanglesOverlap(boxes.hint!, boxes.theme!)).toBe(false);
      }
    }
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
      const cornerStyles = getComputedStyle(frame, "::before");
      const calibrationTicks = getComputedStyle(frame, "::after").backgroundImage;
      const scanLine = getComputedStyle(frame.querySelector(".mbs-scan-line")!);

      return {
        bottom: rectangle.bottom,
        borderWidth: frameStyles.borderTopWidth,
        calibrationTickCount: calibrationTicks.match(/linear-gradient/g)?.length ?? 0,
        cornerBorderRadius: cornerStyles.borderTopLeftRadius,
        cornerBorderWidth: cornerStyles.borderTopWidth,
        cornerMaskCount: cornerStyles.maskImage.match(/linear-gradient/g)?.length ?? 0,
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
    expect(metrics.cornerBorderRadius).not.toBe("0px");
    expect(metrics.cornerBorderWidth).toBe("1px");
    expect(metrics.cornerMaskCount).toBe(4);
    expect(metrics.calibrationTickCount).toBe(4);
    expect(metrics.scanLineHeight).toBe("1px");
  }
});

test("all eight rendered corner arms retain continuous accent pixels", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const viewport of [viewports.shortMobile, viewports.landscape, viewports.desktop]) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?demo-state=active");
    const image = await captureViewfinder(page);
    const arms = cornerArmBounds(image);
    const isAccent = (red: number, green: number, blue: number, alpha: number) =>
      alpha > 200 && blue > 150 && blue - red > 55 && blue - green > 55;

    for (const accentPixelCount of arms.map((bounds) => countPixels(image, bounds, isAccent))) {
      expect(accentPixelCount).toBeGreaterThanOrEqual(20);
    }
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

test("every state keeps its essential content available at 200% text", async ({ page }) => {
  await page.setViewportSize(viewports.shortMobile);

  for (const state of ["idle", "starting", "active", "result", "error"] as const) {
    await page.goto(`/visual.html?demo-state=${state}`);
    await setRootTextScale(page, 200);
    await expectNoHorizontalOverflow(page);

    const app = page.locator(".demo-app");
    const appOverflow = await app.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(appOverflow.scrollWidth).toBe(appOverflow.clientWidth);

    const essential =
      state === "idle"
        ? [page.getByText("Scan when ready."), page.getByRole("button", { name: "Start scanning" })]
        : state === "starting"
          ? [page.getByRole("button", { name: "Cancel camera" })]
          : state === "active"
            ? [
                page.locator(".mbs-viewfinder-frame"),
                page.getByRole("button", { name: "Stop scanning" }),
              ]
            : state === "result"
              ? [
                  page.getByRole("dialog", { name: "QR code" }),
                  page.getByRole("button", { name: "Copy result" }),
                  page.getByRole("button", { name: "Scan again" }),
                  page.getByRole("button", { name: "Close" }),
                ]
              : [
                  page.getByRole("alert"),
                  page.getByRole("button", { name: "Try again" }),
                  page.getByRole("button", { name: "Dismiss error" }),
                ];

    for (const element of essential) {
      await expect(element).toBeVisible();
      const box = await element.boundingBox();
      expect(box).not.toBeNull();
      expectContained(box!, viewports.shortMobile);
    }

    if (state === "idle") {
      const header = await page.locator(".demo-header").boundingBox();
      const heading = await page.getByText("Scan when ready.").boundingBox();
      const start = await page.getByRole("button", { name: "Start scanning" }).boundingBox();
      expect(header).not.toBeNull();
      expect(heading).not.toBeNull();
      expect(start).not.toBeNull();
      expect(rectanglesOverlap(header!, heading!)).toBe(false);
      expect(rectanglesOverlap(heading!, start!)).toBe(false);
    }
  }

  await page.setViewportSize(viewports.narrowLandscape);
  await page.goto("/visual.html?demo-state=idle");
  await setRootTextScale(page, 200);
  await expect(page.locator(".mbs-placeholder-icon")).toBeHidden();

  const heading = await page.getByText("Scan when ready.").boundingBox();
  const start = await page.getByRole("button", { name: "Start scanning" }).boundingBox();
  expect(heading).not.toBeNull();
  expect(start).not.toBeNull();
  expectContained(heading!, viewports.narrowLandscape);
  expectContained(start!, viewports.narrowLandscape);
  expect(rectanglesOverlap(heading!, start!)).toBe(false);
});

test("ultra-short result and long error surfaces remain recoverable", async ({ page }) => {
  await page.setViewportSize(viewports.ultraShortMobile);
  await page.goto("/visual.html?demo-state=result");

  for (const name of ["Copy result", "Scan again", "Close"]) {
    const action = page.getByRole("button", { name });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expectContained(box!, viewports.ultraShortMobile);
  }

  await setRootTextScale(page, 200);
  for (const name of ["Copy result", "Scan again", "Close"]) {
    const action = page.getByRole("button", { name });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expectContained(box!, viewports.ultraShortMobile);
  }

  await page.setViewportSize(viewports.shortMobile);
  await page.goto("/visual.html?demo-state=error");
  await setRootTextScale(page, 200);
  await page.locator(".demo-error-copy span").evaluate((element) => {
    element.textContent = `DecoderFailureCode_${"A".repeat(240)}`;
  });

  const alert = page.getByRole("alert");
  const dimensions = await alert.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  const alertBox = await alert.boundingBox();
  expect(alertBox).not.toBeNull();
  expectContained(alertBox!, viewports.shortMobile);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss error" })).toBeVisible();
});

test("extreme accents retain a dual-tone rendered scan cue", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewports.portrait);
  await page.goto("/visual.html?demo-state=active");

  const scanner = page.locator(".mbs-container");
  const frame = page.locator(".mbs-viewfinder-frame");
  const feed = page.locator(".demo-camera-preview-feed");
  const scanLine = page.locator(".mbs-scan-line");

  await scanner.evaluate((element) => {
    const scannerElement = element as HTMLElement;
    scannerElement.style.setProperty("--mbs-primary", "#000000");
    scannerElement.style.setProperty("--mbs-scrim", "transparent");
  });
  await feed.evaluate((element) => {
    (element as HTMLElement).style.background = "#080808";
  });
  const shadows = await frame.evaluate((element) => ({
    cornerShadow: getComputedStyle(element, "::before").boxShadow,
    scanLineShadow: getComputedStyle(element.querySelector(".mbs-scan-line")!).boxShadow,
  }));
  expect(shadows.cornerShadow).not.toBe("none");
  expect(shadows.scanLineShadow).toContain("-1px");
  expect(shadows.scanLineShadow).toContain("1px");
  expect(shadows.scanLineShadow).toContain("8px");

  const darkFeedImage = await captureViewfinder(page);
  const isLight = (red: number, green: number, blue: number, alpha: number) =>
    alpha > 200 && red > 205 && green > 205 && blue > 205;
  const isBrightRail = (red: number, green: number, blue: number, alpha: number) =>
    alpha > 200 && red > 100 && green > 100 && blue > 100;
  const darkScanBand = await captureScanLineBand(page);
  const darkScanLineStyle = await scanLine.evaluate(
    (element) => getComputedStyle(element).background,
  );
  expect(darkScanLineStyle).toContain("rgb(0, 0, 0)");
  expect(
    countPixels(
      darkScanBand,
      { bottom: darkScanBand.height, left: 0, right: darkScanBand.width, top: 0 },
      isBrightRail,
    ),
  ).toBeGreaterThan(darkScanBand.width * 0.5);
  const lightPixelCounts = cornerArmBounds(darkFeedImage).map((bounds) =>
    countPixels(darkFeedImage, bounds, isLight),
  );
  for (const [index, lightPixelCount] of lightPixelCounts.entries()) {
    expect(
      lightPixelCount,
      `dark-feed corner arm ${index}: ${lightPixelCounts.join(", ")}`,
    ).toBeGreaterThanOrEqual(8);
  }

  await scanner.evaluate((element) => {
    const scannerElement = element as HTMLElement;
    scannerElement.style.setProperty("--mbs-primary", "#ffffff");
    scannerElement.style.setProperty("--mbs-scrim", "transparent");
  });
  await feed.evaluate((element) => {
    (element as HTMLElement).style.background = "#ffffff";
  });
  const image = await captureViewfinder(page);
  const isDark = (red: number, green: number, blue: number, alpha: number) =>
    alpha > 200 && red < 90 && green < 90 && blue < 90;
  const isDarkRail = (red: number, green: number, blue: number, alpha: number) =>
    alpha > 200 && red < 150 && green < 150 && blue < 150;
  const brightScanBand = await captureScanLineBand(page);
  const brightScanLineStyle = await scanLine.evaluate(
    (element) => getComputedStyle(element).background,
  );
  expect(brightScanLineStyle).toContain("rgb(255, 255, 255)");
  expect(
    countPixels(
      brightScanBand,
      { bottom: brightScanBand.height, left: 0, right: brightScanBand.width, top: 0 },
      isDarkRail,
    ),
  ).toBeGreaterThan(brightScanBand.width * 0.5);
  const darkPixelCounts = cornerArmBounds(image).map((bounds) =>
    countPixels(image, bounds, isDark),
  );
  for (const [index, darkPixelCount] of darkPixelCounts.entries()) {
    expect(
      darkPixelCount,
      `corner arm ${index}: ${darkPixelCounts.join(", ")}`,
    ).toBeGreaterThanOrEqual(8);
  }
});

test("standby marks preserve contrast with reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize(viewports.portrait);
  await page.goto("/visual.html?demo-state=starting");

  const placeholder = page.locator(".mbs-placeholder-icon");
  const regular = await placeholder.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { animationName: styles.animationName, opacity: Number(styles.opacity) };
  });
  expect(regular.animationName).toBe("none");
  expect(regular.opacity).toBeGreaterThanOrEqual(0.75);
});

test("forced colors restore a full-contrast standby mark", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Forced-colors emulation is Chromium-specific");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize(viewports.portrait);
  await page.goto("/visual.html?demo-state=starting");
  const placeholder = page.locator(".mbs-placeholder-icon");
  const forced = await placeholder.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { filter: styles.filter, opacity: styles.opacity };
  });
  expect(forced.filter).toBe("none");
  expect(forced.opacity).toBe("1");
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

test("forced-colors mode preserves a visible scan cue", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Forced-colors emulation is Chromium-specific");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize(viewports.portrait);
  await page.goto("/visual.html?demo-state=active");

  const cue = await page.locator(".mbs-scan-line").evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      backgroundImage: styles.backgroundImage,
      boxShadow: styles.boxShadow,
      forcedColors: matchMedia("(forced-colors: active)").matches,
    };
  });

  expect(cue.forcedColors).toBe(true);
  expect(cue.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(cue.backgroundImage).toBe("none");
  expect(cue.boxShadow).toBe("none");
});
