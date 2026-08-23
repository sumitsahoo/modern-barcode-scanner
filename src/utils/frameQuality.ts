const MAX_QUALITY_SAMPLES = 4096;
const MIN_EXPOSURE = 18;
const MAX_EXPOSURE = 242;
const MIN_CONTRAST = 10;
const MIN_SHARPNESS = 2;
const MAX_GLARE_RATIO = 0.88;
const MAX_GLARE_CONTRAST = 50;
const MAX_MOTION_DELTA = 72;
const MIN_FRAME_SCORE = 0.33;

type FrameQualityIssue = "blur" | "contrast" | "exposure" | "glare" | "motion" | "quality";

interface FrameQualityMetrics {
  /** Weighted zero-to-one suitability score. */
  score: number;
  /** Standard deviation of sampled luminance values. */
  contrast: number;
  /** Mean neighboring-pixel luminance delta. */
  sharpness: number;
  /** Fraction of sampled pixels close to clipped white. */
  glare: number;
  /** Mean luminance delta from the preceding comparable frame. */
  motion: number | null;
  /** Mean sampled luminance. */
  exposure: number;
}

export interface FrameQualityReport {
  acceptable: boolean;
  issues: FrameQualityIssue[];
  metrics: FrameQualityMetrics;
}

interface SampledLuminance {
  values: Uint8Array;
  columns: number;
  rows: number;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const getSamplingGrid = (width: number, height: number) => {
  const aspectRatio = width / height;
  const columns = Math.max(
    1,
    Math.min(width, MAX_QUALITY_SAMPLES, Math.floor(Math.sqrt(MAX_QUALITY_SAMPLES * aspectRatio))),
  );
  const rows = Math.max(1, Math.min(height, Math.floor(MAX_QUALITY_SAMPLES / columns)));
  return { columns, rows };
};

/** Choose a stable, dispersed point within a sampling cell to avoid grid aliasing. */
const getSampleCoordinate = (cell: number, cellCount: number, dimension: number, phase: number) => {
  const start = Math.floor((cell * dimension) / cellCount);
  const end = Math.max(start + 1, Math.floor(((cell + 1) * dimension) / cellCount));
  return start + (phase % (end - start));
};

const sampleLuminance = (imageData: ImageData, reusableValues?: Uint8Array): SampledLuminance => {
  const { data, width, height } = imageData;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !(data instanceof Uint8ClampedArray) ||
    !Number.isSafeInteger(width * height * 4) ||
    data.byteLength !== width * height * 4
  ) {
    throw new RangeError("Frame-quality scoring requires valid RGBA image data");
  }

  const { columns, rows } = getSamplingGrid(width, height);
  const sampleCount = columns * rows;
  const values =
    reusableValues?.length === sampleCount ? reusableValues : new Uint8Array(sampleCount);
  let target = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = getSampleCoordinate(column, columns, width, column * 17 + row * 13 + 1);
      const y = getSampleCoordinate(row, rows, height, column * 11 + row * 19 + 1);
      const source = (y * width + x) * 4;
      values[target++] =
        (306 * data[source] + 601 * data[source + 1] + 117 * data[source + 2] + 0x200) >> 10;
    }
  }

  return { values, columns, rows };
};

/**
 * Lightweight camera-frame scorer. It samples at most 4096 pixels and keeps
 * only the previous sampled luminance grid for motion estimation.
 */
export class FrameQualityEstimator {
  private previous?: SampledLuminance;
  private reusableValues?: Uint8Array;

  evaluate(imageData: ImageData): FrameQualityReport {
    const sampled = sampleLuminance(imageData, this.reusableValues);
    const { columns, rows, values } = sampled;

    let sum = 0;
    let sumOfSquares = 0;
    let glarePixels = 0;
    let edgeDelta = 0;
    let edgeCount = 0;

    for (let index = 0; index < values.length; index++) {
      const luminance = values[index];
      sum += luminance;
      sumOfSquares += luminance * luminance;
      if (luminance >= 245) glarePixels++;

      const x = index % columns;
      const y = Math.floor(index / columns);
      if (x > 0) {
        edgeDelta += Math.abs(luminance - values[index - 1]);
        edgeCount++;
      }
      if (y > 0) {
        edgeDelta += Math.abs(luminance - values[index - columns]);
        edgeCount++;
      }
    }

    const exposure = sum / values.length;
    const variance = Math.max(0, sumOfSquares / values.length - exposure * exposure);
    const contrast = Math.sqrt(variance);
    const sharpness = edgeCount ? edgeDelta / edgeCount : 0;
    const glare = glarePixels / values.length;

    let motion: number | null = null;
    if (
      this.previous &&
      this.previous.columns === columns &&
      this.previous.rows === rows &&
      this.previous.values.length === values.length
    ) {
      let frameDelta = 0;
      for (let index = 0; index < values.length; index++) {
        frameDelta += Math.abs(values[index] - this.previous.values[index]);
      }
      motion = frameDelta / values.length;
    }
    this.reusableValues = this.previous?.values;
    this.previous = sampled;

    const issues: FrameQualityIssue[] = [];
    if (exposure < MIN_EXPOSURE || exposure > MAX_EXPOSURE) issues.push("exposure");
    if (contrast < MIN_CONTRAST) issues.push("contrast");
    if (sharpness < MIN_SHARPNESS && contrast < 35) issues.push("blur");
    // A white quiet zone is common around valid symbols. Treat clipped pixels
    // as glare only when the frame also lacks the contrast of printed modules.
    if (glare > MAX_GLARE_RATIO && contrast < MAX_GLARE_CONTRAST) issues.push("glare");
    if (motion !== null && motion > MAX_MOTION_DELTA) issues.push("motion");

    const exposureScore = 1 - clamp(Math.abs(exposure - 128) / 116);
    const contrastScore = clamp((contrast - 4) / 44);
    const sharpnessScore = clamp((sharpness - 1) / 24);
    const glareScore = 1 - clamp((glare - 0.18) / 0.7);
    const motionScore = motion === null ? 1 : 1 - clamp((motion - 18) / 54);
    const score =
      exposureScore * 0.12 +
      contrastScore * 0.28 +
      sharpnessScore * 0.28 +
      glareScore * 0.16 +
      motionScore * 0.16;
    if (score < MIN_FRAME_SCORE) issues.push("quality");

    return {
      acceptable: issues.length === 0,
      issues,
      metrics: { score, contrast, sharpness, glare, motion, exposure },
    };
  }

  reset(): void {
    this.previous = undefined;
    this.reusableValues = undefined;
  }
}
