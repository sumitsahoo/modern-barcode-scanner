import { describe, expect, it } from "vite-plus/test";
import { FACING_MODE, ZOOM_LEVELS } from "./camera";

describe("camera constants", () => {
  it("exposes exactly the two camera facing modes", () => {
    expect(FACING_MODE).toEqual({ ENVIRONMENT: "environment", USER: "user" });
  });

  it("zooms the back camera in more than the front camera", () => {
    expect(ZOOM_LEVELS.BACK).toBeGreaterThan(ZOOM_LEVELS.FRONT);
  });
});
