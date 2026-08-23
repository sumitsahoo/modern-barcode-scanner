import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vite-plus/test";
import { FrameQualityEstimator } from "./frameQuality";

const createFrame = (
  width: number,
  height: number,
  luminanceAt: (x: number, y: number) => number,
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const luminance = luminanceAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = luminance;
      data[offset + 1] = luminance;
      data[offset + 2] = luminance;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
};

const checkerboard = (inverted = false) =>
  createFrame(64, 64, (x, y) => {
    const isLight = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    return isLight === inverted ? 12 : 243;
  });

describe("FrameQualityEstimator", () => {
  it("accepts the independently generated browser QR fixture", () => {
    const png = PNG.sync.read(
      readFileSync(resolve(process.cwd(), "tests/browser/public/fixtures/worker-qr.png")),
    );
    const report = new FrameQualityEstimator().evaluate({
      data: new Uint8ClampedArray(png.data),
      width: png.width,
      height: png.height,
    } as ImageData);

    expect(report.acceptable).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("accepts a stable, sharp, high-contrast frame", () => {
    const report = new FrameQualityEstimator().evaluate(checkerboard());

    expect(report.acceptable).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.metrics.contrast).toBeGreaterThan(100);
    expect(report.metrics.sharpness).toBeGreaterThan(20);
  });

  it("does not alias barcode stripes that line up with the sampling grid", () => {
    const report = new FrameQualityEstimator().evaluate(
      createFrame(256, 256, (x) => (x % 4 < 2 ? 12 : 243)),
    );

    expect(report.acceptable).toBe(true);
    expect(report.metrics.contrast).toBeGreaterThan(100);
    expect(report.metrics.sharpness).toBeGreaterThan(20);
  });

  it("does not confuse a high-contrast white quiet zone with glare", () => {
    const report = new FrameQualityEstimator().evaluate(
      createFrame(128, 128, (x) => (x % 32 < 2 ? 0 : 255)),
    );

    expect(report.metrics.glare).toBeGreaterThan(0.9);
    expect(report.metrics.contrast).toBeGreaterThan(50);
    expect(report.issues).not.toContain("glare");
  });

  it("keeps sampling bounded for extremely narrow frames", () => {
    const report = new FrameQualityEstimator().evaluate(
      createFrame(1, 8192, (_x, y) => (y % 2 === 0 ? 12 : 243)),
    );

    expect(Number.isFinite(report.metrics.score)).toBe(true);
    expect(report.metrics.contrast).toBeGreaterThan(100);
  });

  it("identifies low contrast and blur without rejecting usable exposure alone", () => {
    const flat = new FrameQualityEstimator().evaluate(createFrame(64, 64, () => 128));
    const blurred = new FrameQualityEstimator().evaluate(createFrame(64, 64, (x) => 96 + x));

    expect(flat.acceptable).toBe(false);
    expect(flat.issues).toEqual(expect.arrayContaining(["contrast", "blur"]));
    expect(blurred.acceptable).toBe(false);
    expect(blurred.issues).toContain("blur");
    expect(blurred.issues).not.toContain("exposure");
  });

  it("scores clipped glare and excessive inter-frame motion", () => {
    const glare = new FrameQualityEstimator().evaluate(
      createFrame(64, 64, (x, y) => (x + y < 8 ? 0 : 255)),
    );
    const motionEstimator = new FrameQualityEstimator();
    const stable = motionEstimator.evaluate(checkerboard());
    const moving = motionEstimator.evaluate(checkerboard(true));

    expect(glare.acceptable).toBe(false);
    expect(glare.issues).toContain("glare");
    expect(stable.metrics.motion).toBeNull();
    expect(moving.acceptable).toBe(false);
    expect(moving.issues).toContain("motion");
    expect(moving.metrics.motion).toBeGreaterThan(200);
  });

  it("uses the aggregate score for compounded low-value frames", () => {
    const estimator = new FrameQualityEstimator();
    const first = createFrame(64, 64, (x) => (x < 32 ? 179 : 250));
    const second = createFrame(64, 64, (x) => (x < 32 ? 250 : 179));

    estimator.evaluate(first);
    const report = estimator.evaluate(second);

    expect(report.metrics.motion).toBe(71);
    expect(report.metrics.score).toBeLessThan(0.33);
    expect(report.issues).toContain("quality");
    expect(report.issues).not.toContain("motion");
  });

  it("resets its motion baseline", () => {
    const estimator = new FrameQualityEstimator();
    estimator.evaluate(checkerboard());
    estimator.reset();

    expect(estimator.evaluate(checkerboard(true)).metrics.motion).toBeNull();
  });

  it("rejects malformed frames instead of producing invalid metrics", () => {
    expect(() =>
      new FrameQualityEstimator().evaluate({
        data: new Uint8ClampedArray(3),
        width: 1,
        height: 1,
      } as ImageData),
    ).toThrow("valid RGBA image data");
    expect(() =>
      new FrameQualityEstimator().evaluate({
        data: new Uint8Array(4),
        width: 1,
        height: 1,
      } as unknown as ImageData),
    ).toThrow("valid RGBA image data");
  });
});
