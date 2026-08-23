import { describe, expect, it } from "vite-plus/test";
import {
  CANVAS_CONTEXT_OPTIONS,
  FULL_FRAME_SCAN_INTERVAL,
  MAX_SCAN_DIMENSION,
  SCAN_INTERVAL_MS,
} from "./scanner";

describe("scanner constants", () => {
  it("ships sane performance defaults", () => {
    expect(SCAN_INTERVAL_MS).toBeGreaterThan(0);
    expect(MAX_SCAN_DIMENSION).toBeGreaterThan(0);
    expect(FULL_FRAME_SCAN_INTERVAL).toBeGreaterThan(1);
  });

  it("configures the canvas context for frequent reads", () => {
    // getImageData runs every frame, so the canvas must opt into frequent reads.
    expect(CANVAS_CONTEXT_OPTIONS.willReadFrequently).toBe(true);
    expect(CANVAS_CONTEXT_OPTIONS.alpha).toBe(false);
  });
});
