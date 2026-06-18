import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FACING_MODE } from "../constants/camera";
import { convertToGrayscale, getMediaConstraints, isPhone, stopAllTracks } from "./barcodeHelpers";

const setUserAgent = (value: string) => {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
};

describe("barcodeHelpers", () => {
  describe("isPhone", () => {
    const originalUserAgent = navigator.userAgent;
    afterEach(() => setUserAgent(originalUserAgent));

    it.each([
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X)", true],
      ["Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X)", true],
      ["Mozilla/5.0 (iPod touch; CPU iPhone OS 12_0 like Mac OS X)", true],
      ["Mozilla/5.0 (Linux; Android 10; SM-G981B)", true],
      ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", false],
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false],
    ])("returns the expected result for %s", (ua, expected) => {
      setUserAgent(ua);
      expect(isPhone()).toBe(expected);
    });
  });

  describe("convertToGrayscale", () => {
    it("converts RGBA to grayscale using the luminosity method", () => {
      // 2x2 pixels: red, green, blue, white.
      const data = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
      ]);
      const imageData = { data, width: 2, height: 2 } as ImageData;

      const result = convertToGrayscale(imageData);

      // gray = (R*77 + G*150 + B*29) >> 8
      expect([result.data[0], result.data[1], result.data[2]]).toEqual([76, 76, 76]);
      expect([result.data[4], result.data[5], result.data[6]]).toEqual([149, 149, 149]);
      expect([result.data[8], result.data[9], result.data[10]]).toEqual([28, 28, 28]);
      expect([result.data[12], result.data[13], result.data[14]]).toEqual([255, 255, 255]);
    });

    it("leaves the alpha channel untouched", () => {
      const data = new Uint8ClampedArray([10, 20, 30, 200]);
      const result = convertToGrayscale({ data, width: 1, height: 1 } as ImageData);
      expect(result.data[3]).toBe(200);
    });

    it("mutates and returns the same ImageData reference", () => {
      const imageData = {
        data: new Uint8ClampedArray([100, 100, 100, 255]),
        width: 1,
        height: 1,
      } as ImageData;
      expect(convertToGrayscale(imageData)).toBe(imageData);
    });
  });

  describe("stopAllTracks", () => {
    it("stops every track in the stream", () => {
      const stop1 = vi.fn();
      const stop2 = vi.fn();
      const stream = {
        getTracks: () => [{ stop: stop1 }, { stop: stop2 }],
      } as unknown as MediaStream;

      stopAllTracks(stream);

      expect(stop1).toHaveBeenCalledOnce();
      expect(stop2).toHaveBeenCalledOnce();
    });

    it("is a no-op for a null stream", () => {
      expect(() => stopAllTracks(null)).not.toThrow();
    });
  });

  describe("getMediaConstraints", () => {
    // jsdom's default user agent is not a phone, so the flash-camera lookup
    // (which needs mediaDevices) is skipped and the result is deterministic.
    it("never requests audio", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.ENVIRONMENT);
      expect(constraints.audio).toBe(false);
    });

    it("applies the requested facing mode and desktop resolution", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.ENVIRONMENT);
      const video = constraints.video as MediaTrackConstraints & { zoom?: number };
      expect(video.facingMode).toBe("environment");
      expect(video.width).toEqual({ ideal: 1280 });
      // Back camera zooms in by default.
      expect(video.zoom).toBe(2);
    });

    it("uses the front zoom level for the user-facing camera", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.USER);
      const video = constraints.video as MediaTrackConstraints & { zoom?: number };
      expect(video.facingMode).toBe("user");
      expect(video.zoom).toBe(1);
    });
  });
});
