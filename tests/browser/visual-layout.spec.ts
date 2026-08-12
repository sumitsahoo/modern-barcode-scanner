import { expect, test, type Page } from "@playwright/test";

const viewports = {
  desktop: { width: 1440, height: 900 },
  portrait: { width: 390, height: 844 },
  compact: { width: 320, height: 568 },
  landscape: { width: 844, height: 390 },
} as const;

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
};

test("visual audit cards fit desktop and mobile viewports", async ({ page }) => {
  for (const viewport of [viewports.desktop, viewports.portrait]) {
    await page.setViewportSize(viewport);
    await page.goto("/visual.html?visual-audit");

    const cards = page.locator(".visual-audit-card");
    await expect(cards).toHaveCount(7);
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
  }
});

test("result dialog fits a compact viewport and traps keyboard focus", async ({ page }) => {
  await page.setViewportSize(viewports.compact);
  await page.goto("/visual.html?demo-state=result");

  const dialog = page.getByRole("dialog", { name: "QR code" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
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
        ".mbs-scan-line-container, .mbs-scan-line-trail-down, .mbs-scan-line-trail-up",
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
