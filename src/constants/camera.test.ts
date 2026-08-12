import { describe, expect, it } from "vite-plus/test";
import { CAMERA_DEFAULTS, FACING_MODE } from "./camera";

describe("camera constants", () => {
  it("exposes exactly the two camera facing modes", () => {
    expect(FACING_MODE).toEqual({ ENVIRONMENT: "environment", USER: "user" });
  });

  it("uses non-mandatory frame-rate constraints", () => {
    expect(CAMERA_DEFAULTS.frameRate).toEqual({ ideal: 15, max: 30 });
  });
});
