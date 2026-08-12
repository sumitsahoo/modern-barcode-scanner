import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

interface MockWorkerInstance {
  emitMessage: (data: unknown) => void;
  messageListenerAdds: number;
  messageListenerRemoves: number;
  postedMessages: Array<Record<string, unknown>>;
}

const workerHarness = vi.hoisted(() => ({
  instances: [] as MockWorkerInstance[],
}));

vi.mock("../workers/scanner.worker.ts?worker&inline", () => ({
  default: class MockScannerWorker {
    private readonly messageListeners = new Set<(event: MessageEvent) => void>();
    messageListenerAdds = 0;
    messageListenerRemoves = 0;
    postedMessages: Array<Record<string, unknown>> = [];

    constructor() {
      workerHarness.instances.push(this);
    }

    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") {
        this.messageListeners.add(listener);
        this.messageListenerAdds += 1;
      }
    }

    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") {
        this.messageListeners.delete(listener);
        this.messageListenerRemoves += 1;
      }
    }

    emitMessage(data: unknown) {
      for (const listener of this.messageListeners) {
        listener({ data } as MessageEvent);
      }
    }

    postMessage(data: Record<string, unknown>) {
      this.postedMessages.push(data);
    }

    terminate() {}
  },
}));

import { useScanner } from "./useScanner";

describe("useScanner shared worker routing", () => {
  it("delivers results and decode errors only to the originating scanner", () => {
    const firstOnScan = vi.fn();
    const firstOnError = vi.fn();
    const updatedFirstOnError = vi.fn();
    const secondOnScan = vi.fn();
    const secondOnError = vi.fn();

    const first = renderHook(
      ({ errorHandler }) =>
        useScanner({
          onScan: firstOnScan,
          onError: errorHandler,
          enableVibration: false,
        }),
      { initialProps: { errorHandler: firstOnError } },
    );
    const second = renderHook(() =>
      useScanner({
        onScan: secondOnScan,
        onError: secondOnError,
        enableVibration: false,
      }),
    );

    expect(workerHarness.instances).toHaveLength(1);
    const worker = workerHarness.instances[0];
    expect(worker.messageListenerAdds).toBe(2);

    first.rerender({ errorHandler: updatedFirstOnError });
    expect(worker.messageListenerAdds).toBe(2);
    expect(worker.messageListenerRemoves).toBe(0);

    act(() => {
      worker.emitMessage({
        found: false,
        scannerId: 1,
        sessionId: 0,
        error: "First decode failed",
      });
    });

    expect(updatedFirstOnError).toHaveBeenCalledWith(new Error("First decode failed"));
    expect(firstOnError).not.toHaveBeenCalled();

    act(() => {
      worker.emitMessage({
        found: true,
        scannerId: 1,
        sessionId: 1,
        data: { typeName: "QRCODE", scanData: "first" },
      });
    });

    expect(firstOnScan).toHaveBeenCalledWith({ typeName: "QRCODE", scanData: "first" });
    expect(secondOnScan).not.toHaveBeenCalled();

    act(() => {
      worker.emitMessage({
        found: false,
        scannerId: 2,
        sessionId: 0,
        error: "Decode failed",
      });
    });

    expect(secondOnError).toHaveBeenCalledWith(new Error("Decode failed"));
    expect(firstOnError).not.toHaveBeenCalled();

    first.unmount();
    second.unmount();
  });

  it("does not let a stale response unlock the active scan session", async () => {
    const animationCallbacks = new Map<number, FrameRequestCallback>();
    let nextAnimationId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextAnimationId++;
      animationCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => animationCallbacks.delete(id));

    const createStream = () => {
      const track = {
        stop: vi.fn(),
        getSettings: () => ({ width: 640, height: 480, facingMode: "environment" }),
        getCapabilities: () => ({ torch: false }),
      };
      return {
        getTracks: () => [track],
        getVideoTracks: () => [track],
      } as unknown as MediaStream;
    };

    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => createStream()),
        enumerateDevices: vi.fn(async () => [
          { kind: "videoinput", deviceId: "rear" },
          { kind: "videoinput", deviceId: "front" },
        ]),
      },
    });

    const hook = renderHook(() =>
      useScanner({
        onScan: vi.fn(),
        onError: vi.fn(),
        enableVibration: false,
        scanInterval: 0,
      }),
    );

    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    const runLatestAnimationFrame = () => {
      const entries = [...animationCallbacks.entries()];
      const entry = entries[entries.length - 1];
      if (!entry) throw new Error("No animation frame was scheduled");
      animationCallbacks.delete(entry[0]);
      entry[1](Date.now());
    };

    await act(async () => hook.result.current.handleScan());
    act(runLatestAnimationFrame);

    const worker = workerHarness.instances[0];
    expect(worker.postedMessages).toHaveLength(1);
    const staleRequest = worker.postedMessages[0];

    act(() => hook.result.current.handleStopScan());
    await act(async () => hook.result.current.handleScan());
    act(runLatestAnimationFrame);
    expect(worker.postedMessages).toHaveLength(2);

    act(() => {
      worker.emitMessage({
        found: false,
        scannerId: staleRequest.scannerId,
        sessionId: staleRequest.sessionId,
      });
    });
    act(runLatestAnimationFrame);

    expect(worker.postedMessages).toHaveLength(2);

    hook.unmount();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
  });

  it("does not let a rejected stale start stop its replacement stream", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const createStream = () => {
      const track = {
        stop: vi.fn(),
        getSettings: () => ({ width: 640, height: 480, facingMode: "environment" }),
        getCapabilities: () => ({ torch: false }),
      };
      return {
        track,
        stream: {
          getTracks: () => [track],
          getVideoTracks: () => [track],
        } as unknown as MediaStream,
      };
    };
    const firstMedia = createStream();
    const replacementMedia = createStream();

    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockResolvedValueOnce(firstMedia.stream)
          .mockResolvedValueOnce(replacementMedia.stream),
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "rear" }]),
      },
    });

    let rejectFirstPlay: ((reason?: unknown) => void) | undefined;
    const firstPlay = new Promise<void>((_resolve, reject) => {
      rejectFirstPlay = reject;
    });
    const video = {
      srcObject: null as MediaStream | null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi
        .fn()
        .mockImplementationOnce(() => firstPlay)
        .mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(),
      })),
    };

    const hook = renderHook(() =>
      useScanner({
        onScan: vi.fn(),
        onError: vi.fn(),
        enableVibration: false,
      }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    let staleStart: Promise<void> | undefined;
    act(() => {
      staleStart = hook.result.current.handleScan();
    });
    await waitFor(() => expect(video.play).toHaveBeenCalledOnce());

    await act(async () => hook.result.current.handleScan());
    expect(hook.result.current.scannerState.isScanning).toBe(true);
    expect(video.srcObject).toBe(replacementMedia.stream);

    await act(async () => {
      rejectFirstPlay?.(new Error("The replaced stream was stopped"));
      await staleStart;
    });

    expect(hook.result.current.scannerState.isScanning).toBe(true);
    expect(video.srcObject).toBe(replacementMedia.stream);
    expect(replacementMedia.track.stop).not.toHaveBeenCalled();

    hook.unmount();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
  });

  it("applies and reports supported torch state", async () => {
    const applyConstraints = vi.fn(async () => undefined);
    const track = {
      stop: vi.fn(),
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = { srcObject: stream, pause: vi.fn() };

    const hook = renderHook(() =>
      useScanner({
        onScan: vi.fn(),
        onError: vi.fn(),
        enableVibration: false,
      }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;

    await act(async () => hook.result.current.handleToggleTorch());

    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(hook.result.current.scannerState.isTorchOn).toBe(true);

    hook.unmount();
  });
});
