import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FACING_MODE } from "../constants/camera";
import { getBestRearCamera, getMediaConstraints, isPhone, stopAllTracks } from "./barcodeHelpers";

const setUserAgent = (value: string) => {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
};

const setMediaDevices = (value: MediaDevices) => {
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  };
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

    it("is safe when rendered without a browser navigator", () => {
      vi.stubGlobal("navigator", undefined);
      expect(isPhone()).toBe(false);
      vi.unstubAllGlobals();
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

    it("continues cleanup when one track throws", () => {
      const stopAfterFailure = vi.fn();
      const stream = {
        getTracks: () => [
          {
            stop: () => {
              throw new DOMException("Track is already invalid", "InvalidStateError");
            },
          },
          { stop: stopAfterFailure },
        ],
      } as unknown as MediaStream;

      expect(() => stopAllTracks(stream)).not.toThrow();
      expect(stopAfterFailure).toHaveBeenCalledOnce();
    });
  });

  describe("getBestRearCamera", () => {
    it("returns null and releases permission media when enumeration fails", async () => {
      const stop = vi.fn();
      const stream = {
        getTracks: () => [{ stop }],
      } as unknown as MediaStream;
      const restore = setMediaDevices({
        getUserMedia: vi.fn(async () => stream),
        enumerateDevices: vi.fn(async () => {
          throw new DOMException("Enumeration blocked", "NotAllowedError");
        }),
      } as unknown as MediaDevices);

      try {
        await expect(getBestRearCamera()).resolves.toBeNull();
        expect(stop).toHaveBeenCalledOnce();
      } finally {
        restore();
      }
    });

    it("can select a rear camera when optional capabilities are unavailable", async () => {
      const stopPermission = vi.fn();
      const stopCamera = vi.fn();
      const permissionStream = {
        getTracks: () => [{ stop: stopPermission }],
      } as unknown as MediaStream;
      const cameraTrack = {
        stop: stopCamera,
        getSettings: () => ({ facingMode: "environment" }),
      };
      const cameraStream = {
        getTracks: () => [cameraTrack],
        getVideoTracks: () => [cameraTrack],
      } as unknown as MediaStream;
      const restore = setMediaDevices({
        getUserMedia: vi
          .fn()
          .mockResolvedValueOnce(permissionStream)
          .mockResolvedValueOnce(cameraStream),
        enumerateDevices: vi.fn(async () => [
          { kind: "videoinput", deviceId: "rear", label: "Back Camera" },
        ]),
      } as unknown as MediaDevices);

      try {
        await expect(getBestRearCamera()).resolves.toBe("rear");
        expect(stopPermission).toHaveBeenCalledOnce();
        expect(stopCamera).toHaveBeenCalledOnce();
      } finally {
        restore();
      }
    });
  });

  describe("getMediaConstraints", () => {
    it("never requests audio", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.ENVIRONMENT);
      expect(constraints.audio).toBe(false);
    });

    it("applies the requested facing mode and desktop resolution", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.ENVIRONMENT);
      const video = constraints.video as MediaTrackConstraints;
      expect(video.facingMode).toEqual({ ideal: "environment" });
      expect(video.width).toEqual({ ideal: 1280 });
      expect(video).not.toHaveProperty("zoom");
      expect(video).not.toHaveProperty("focusDistance");
    });

    it("uses a non-mandatory user-facing camera preference", async () => {
      const constraints = await getMediaConstraints(FACING_MODE.USER);
      const video = constraints.video as MediaTrackConstraints;
      expect(video.facingMode).toEqual({ ideal: "user" });
    });
  });
});
