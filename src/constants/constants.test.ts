import { describe, expect, it } from "vite-plus/test";
import { FACING_MODE, ZOOM_LEVELS } from "./camera";
import { CANVAS_CONTEXT_OPTIONS, MAX_SCAN_DIMENSION, SCAN_INTERVAL_MS } from "./scanner";
import { SCANNER_THEME } from "./theme";

describe("constants", () => {
  it("uses Ocean Blue (#2563EB) as the primary theme color", () => {
    expect(SCANNER_THEME.primary.toLowerCase()).toBe("#2563eb");
    expect(SCANNER_THEME.primaryDark.toLowerCase()).toBe("#1d4ed8");
  });

  it("exposes exactly the two camera facing modes", () => {
    expect(FACING_MODE).toEqual({ ENVIRONMENT: "environment", USER: "user" });
  });

  it("zooms the back camera in more than the front camera", () => {
    expect(ZOOM_LEVELS.BACK).toBeGreaterThan(ZOOM_LEVELS.FRONT);
  });

  it("ships sane scanner performance defaults", () => {
    expect(SCAN_INTERVAL_MS).toBeGreaterThan(0);
    expect(MAX_SCAN_DIMENSION).toBeGreaterThan(0);
    // getImageData runs every frame, so the canvas must opt into frequent reads.
    expect(CANVAS_CONTEXT_OPTIONS.willReadFrequently).toBe(true);
    expect(CANVAS_CONTEXT_OPTIONS.alpha).toBe(false);
  });
});
