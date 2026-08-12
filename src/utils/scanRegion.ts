const VIEWFINDER_MARGIN_RATIO = 0.04;
const MIN_REGION_DIMENSION = 32;

export interface RectangleLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Map a viewfinder overlay through `object-fit: cover` into video pixels. */
export const getViewfinderSourceRegion = (
  sourceWidth: number,
  sourceHeight: number,
  videoRectangle: RectangleLike,
  viewfinderRectangle: RectangleLike,
): SourceRegion | null => {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    videoRectangle.width <= 0 ||
    videoRectangle.height <= 0 ||
    viewfinderRectangle.width <= 0 ||
    viewfinderRectangle.height <= 0
  ) {
    return null;
  }

  const margin =
    Math.min(viewfinderRectangle.width, viewfinderRectangle.height) * VIEWFINDER_MARGIN_RATIO;
  const visibleLeft = clamp(
    viewfinderRectangle.left - margin,
    videoRectangle.left,
    videoRectangle.left + videoRectangle.width,
  );
  const visibleTop = clamp(
    viewfinderRectangle.top - margin,
    videoRectangle.top,
    videoRectangle.top + videoRectangle.height,
  );
  const visibleRight = clamp(
    viewfinderRectangle.left + viewfinderRectangle.width + margin,
    videoRectangle.left,
    videoRectangle.left + videoRectangle.width,
  );
  const visibleBottom = clamp(
    viewfinderRectangle.top + viewfinderRectangle.height + margin,
    videoRectangle.top,
    videoRectangle.top + videoRectangle.height,
  );

  const coverScale = Math.max(
    videoRectangle.width / sourceWidth,
    videoRectangle.height / sourceHeight,
  );
  const hiddenX = (sourceWidth * coverScale - videoRectangle.width) / 2;
  const hiddenY = (sourceHeight * coverScale - videoRectangle.height) / 2;

  const sourceLeft = clamp(
    Math.floor((visibleLeft - videoRectangle.left + hiddenX) / coverScale),
    0,
    sourceWidth,
  );
  const sourceTop = clamp(
    Math.floor((visibleTop - videoRectangle.top + hiddenY) / coverScale),
    0,
    sourceHeight,
  );
  const sourceRight = clamp(
    Math.ceil((visibleRight - videoRectangle.left + hiddenX) / coverScale),
    0,
    sourceWidth,
  );
  const sourceBottom = clamp(
    Math.ceil((visibleBottom - videoRectangle.top + hiddenY) / coverScale),
    0,
    sourceHeight,
  );
  const width = sourceRight - sourceLeft;
  const height = sourceBottom - sourceTop;

  if (width < MIN_REGION_DIMENSION || height < MIN_REGION_DIMENSION) return null;
  return { x: sourceLeft, y: sourceTop, width, height };
};
