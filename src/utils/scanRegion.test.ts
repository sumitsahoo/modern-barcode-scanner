import { describe, expect, it } from "vite-plus/test";
import { getViewfinderSourceRegion } from "./scanRegion";

describe("getViewfinderSourceRegion", () => {
  it("maps and pads a viewfinder when source and display aspect ratios match", () => {
    expect(
      getViewfinderSourceRegion(
        800,
        600,
        { left: 0, top: 0, width: 800, height: 600 },
        { left: 200, top: 150, width: 400, height: 300 },
      ),
    ).toEqual({ x: 188, y: 138, width: 424, height: 324 });
  });

  it("accounts for video pixels hidden by portrait object-fit cover", () => {
    expect(
      getViewfinderSourceRegion(
        1920,
        1080,
        { left: 0, top: 0, width: 390, height: 844 },
        { left: 16, top: 220, width: 358, height: 400 },
      ),
    ).toEqual({ x: 712, y: 263, width: 496, height: 549 });
  });

  it("falls back when layout geometry is unavailable or too small", () => {
    expect(
      getViewfinderSourceRegion(
        1920,
        1080,
        { left: 0, top: 0, width: 0, height: 844 },
        { left: 16, top: 220, width: 358, height: 400 },
      ),
    ).toBeNull();
    expect(
      getViewfinderSourceRegion(
        1920,
        1080,
        { left: 0, top: 0, width: 390, height: 844 },
        { left: 100, top: 100, width: 2, height: 2 },
      ),
    ).toBeNull();
  });

  it("rejects non-finite source and layout measurements", () => {
    const videoRectangle = { left: 0, top: 0, width: 390, height: 844 };
    const viewfinderRectangle = { left: 16, top: 220, width: 358, height: 400 };

    expect(
      getViewfinderSourceRegion(Number.NaN, 1080, videoRectangle, viewfinderRectangle),
    ).toBeNull();
    expect(
      getViewfinderSourceRegion(
        1920,
        1080,
        { ...videoRectangle, left: Number.NEGATIVE_INFINITY },
        viewfinderRectangle,
      ),
    ).toBeNull();
    expect(
      getViewfinderSourceRegion(1920, 1080, videoRectangle, {
        ...viewfinderRectangle,
        height: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});
