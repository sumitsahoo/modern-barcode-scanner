import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

interface MockWorkerInstance {
  emitError: (message: string) => void;
  emitMessage: (data: unknown) => void;
  emitMessageError: () => void;
  messageListenerAdds: number;
  messageListenerRemoves: number;
  postedMessages: Array<Record<string, unknown>>;
  terminateCalls: number;
  transferLists: Transferable[][];
}

const workerHarness = vi.hoisted(() => ({
  constructorError: null as Error | null,
  instances: [] as MockWorkerInstance[],
}));

vi.mock("../workers/scanner.worker.ts?worker&inline", () => ({
  default: class MockScannerWorker {
    private readonly messageListeners = new Set<(event: MessageEvent) => void>();
    private readonly errorListeners = new Set<(event: ErrorEvent) => void>();
    private readonly messageErrorListeners = new Set<(event: MessageEvent) => void>();
    messageListenerAdds = 0;
    messageListenerRemoves = 0;
    postedMessages: Array<Record<string, unknown>> = [];
    terminateCalls = 0;
    transferLists: Transferable[][] = [];

    constructor() {
      if (workerHarness.constructorError) throw workerHarness.constructorError;
      workerHarness.instances.push(this);
    }

    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") {
        this.messageListeners.add(listener);
        this.messageListenerAdds += 1;
      } else if (type === "error") {
        this.errorListeners.add(listener as unknown as (event: ErrorEvent) => void);
      } else if (type === "messageerror") {
        this.messageErrorListeners.add(listener);
      }
    }

    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") {
        this.messageListeners.delete(listener);
        this.messageListenerRemoves += 1;
      } else if (type === "error") {
        this.errorListeners.delete(listener as unknown as (event: ErrorEvent) => void);
      } else if (type === "messageerror") {
        this.messageErrorListeners.delete(listener);
      }
    }

    emitMessage(data: unknown) {
      for (const listener of this.messageListeners) {
        listener({ currentTarget: this, data } as unknown as MessageEvent);
      }
    }

    emitError(message: string) {
      for (const listener of this.errorListeners) {
        listener({ currentTarget: this, message } as unknown as ErrorEvent);
      }
    }

    emitMessageError() {
      for (const listener of this.messageErrorListeners) {
        listener({ currentTarget: this } as unknown as MessageEvent);
      }
    }

    postMessage(data: Record<string, unknown>, transfer: Transferable[] = []) {
      this.postedMessages.push(data);
      this.transferLists.push(transfer);
    }

    terminate() {
      this.terminateCalls += 1;
    }
  },
}));

import { useScanner } from "./useScanner";

afterEach(() => {
  workerHarness.constructorError = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const installAnimationHarness = () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));

  return {
    runLatest() {
      const entries = [...callbacks.entries()];
      const entry = entries[entries.length - 1];
      if (!entry) throw new Error("No animation frame was scheduled");
      callbacks.delete(entry[0]);
      entry[1](Date.now());
    },
  };
};

const setMediaDevices = (value: MediaDevices) => {
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  };
};

describe("useScanner shared worker routing", () => {
  it("keeps shared-worker listeners stable and ignores unsolicited responses", () => {
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
        requestId: 1,
        scannerId: 1,
        sessionId: 0,
        error: "First decode failed",
      });
    });

    expect(updatedFirstOnError).not.toHaveBeenCalled();
    expect(firstOnError).not.toHaveBeenCalled();

    act(() => {
      worker.emitMessage({
        found: true,
        requestId: 1,
        scannerId: 1,
        sessionId: 1,
        data: { typeName: "QRCODE", scanData: "first" },
      });
    });

    expect(firstOnScan).not.toHaveBeenCalled();
    expect(secondOnScan).not.toHaveBeenCalled();

    act(() => {
      worker.emitMessage({
        found: false,
        requestId: 1,
        scannerId: 2,
        sessionId: 0,
        error: "Decode failed",
      });
    });

    expect(secondOnError).not.toHaveBeenCalled();
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
        requestId: staleRequest.requestId,
        scannerId: staleRequest.scannerId,
        sessionId: staleRequest.sessionId,
      });
    });
    act(runLatestAnimationFrame);

    expect(worker.postedMessages).toHaveLength(2);

    const activeRequest = worker.postedMessages[1];
    act(() => {
      worker.emitMessage({
        found: false,
        requestId: (activeRequest.requestId as number) + 1,
        scannerId: activeRequest.scannerId,
        sessionId: activeRequest.sessionId,
      });
    });
    act(runLatestAnimationFrame);
    expect(worker.postedMessages).toHaveLength(2);

    act(() => {
      worker.emitMessage({
        found: false,
        requestId: activeRequest.requestId,
        scannerId: activeRequest.scannerId,
        sessionId: activeRequest.sessionId,
      });
    });
    act(runLatestAnimationFrame);
    expect(worker.postedMessages).toHaveLength(3);

    hook.unmount();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
  });

  it("prioritizes the visible viewfinder and periodically restores the full frame", async () => {
    const animationCallbacks = new Map<number, FrameRequestCallback>();
    let nextAnimationId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextAnimationId++;
      animationCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => animationCallbacks.delete(id));

    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 1920, height: 1080, facingMode: "environment" }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => stream),
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "rear" }]),
      },
    });

    const video = {
      srcObject: null as MediaStream | null,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    };
    const drawImage = vi.fn();
    const getImageData = vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage, getImageData })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: vi.fn(), enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;
    hook.result.current.viewfinderRef.current = {
      getBoundingClientRect: () => ({ left: 16, top: 220, width: 358, height: 400 }),
    } as HTMLDivElement;

    const runLatestAnimationFrame = () => {
      const entries = [...animationCallbacks.entries()];
      const entry = entries[entries.length - 1];
      if (!entry) throw new Error("No animation frame was scheduled");
      animationCallbacks.delete(entry[0]);
      entry[1](Date.now());
    };

    await act(async () => hook.result.current.handleScan());
    const worker = workerHarness.instances[workerHarness.instances.length - 1];
    const initialMessageCount = worker.postedMessages.length;

    for (let attempt = 0; attempt < 5; attempt++) {
      act(runLatestAnimationFrame);
      const request = worker.postedMessages[initialMessageCount + attempt];
      expect(request).toBeDefined();
      act(() => {
        worker.emitMessage({
          found: false,
          requestId: request.requestId,
          scannerId: request.scannerId,
          sessionId: request.sessionId,
        });
      });
    }

    const requests = worker.postedMessages.slice(initialMessageCount);
    expect(requests.map((request) => request.region)).toEqual([
      "viewfinder",
      "viewfinder",
      "viewfinder",
      "viewfinder",
      "full",
    ]);
    expect((requests[0].imageData as ImageData).width).toBeLessThan(1280);
    expect((requests[0].imageData as ImageData).height).toBeLessThan(720);
    expect(requests[4].imageData).toMatchObject({ width: 1280, height: 720 });
    expect(drawImage.mock.calls[0]).toHaveLength(9);
    expect(drawImage.mock.calls[4]).toHaveLength(5);

    hook.unmount();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
  });

  it("stops and detaches the owned camera stream before reporting a detection", async () => {
    let animationCallback: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationCallback = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480, facingMode: "environment" }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => stream),
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "rear" }]),
      },
    });

    const video = {
      srcObject: null as MediaStream | null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(640 * 480 * 4),
          width: 640,
          height: 480,
        })),
      })),
    };
    const cleanupObservedByCallback: Array<unknown> = [];
    const onScan = vi.fn(() => {
      cleanupObservedByCallback.push(track.stop.mock.calls.length, video.srcObject);
    });
    const hook = renderHook(() => useScanner({ onScan, onError: vi.fn(), enableVibration: false }));
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    expect(video.srcObject).toBe(stream);
    act(() => animationCallback?.(Date.now()));

    const worker = workerHarness.instances[0];
    const request = worker.postedMessages[worker.postedMessages.length - 1];
    expect(request).toBeDefined();
    act(() => {
      worker.emitMessage({
        found: true,
        requestId: request?.requestId,
        scannerId: request?.scannerId,
        sessionId: request?.sessionId,
        data: { typeName: "QRCODE", scanData: "detected" },
      });
    });

    expect(onScan).toHaveBeenCalledWith({ typeName: "QRCODE", scanData: "detected" });
    expect(cleanupObservedByCallback).toEqual([1, null]);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(hook.result.current.scannerState.isScanning).toBe(false);

    hook.unmount();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
  });

  it("releases the owned stream on unmount even if the video attachment was cleared", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480, facingMode: "environment" }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => stream),
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput", deviceId: "rear" }]),
      },
    });
    const video = {
      srcObject: null as MediaStream | null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: vi.fn(), enableVibration: false }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    video.srcObject = null;
    hook.unmount();

    expect(track.stop).toHaveBeenCalledOnce();

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

  it("recomputes capture geometry when a switched camera changes orientation", async () => {
    const animation = installAnimationHarness();
    const firstTrack = {
      stop: vi.fn(),
      getSettings: () => ({ width: 1920, height: 1080 }),
      getCapabilities: () => ({ torch: false }),
    };
    const secondTrack = {
      stop: vi.fn(),
      getSettings: () => ({ width: 720, height: 1280 }),
      getCapabilities: () => ({ torch: false }),
    };
    const firstStream = {
      getTracks: () => [firstTrack],
      getVideoTracks: () => [firstTrack],
    } as unknown as MediaStream;
    const secondStream = {
      getTracks: () => [secondTrack],
      getVideoTracks: () => [secondTrack],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn().mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream),
      enumerateDevices: vi.fn(async () => [
        { kind: "videoinput", deviceId: "rear" },
        { kind: "videoinput", deviceId: "front" },
      ]),
    } as unknown as MediaDevices);

    const video = {
      srcObject: null as MediaStream | null,
      videoWidth: 1920,
      videoHeight: 1080,
      play: vi.fn(async () => {
        if (video.srcObject === secondStream) {
          video.videoWidth = 720;
          video.videoHeight = 1280;
        }
      }),
      pause: vi.fn(),
    };
    const frames: ImageData[] = [];
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
        const frame = {
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        } as ImageData;
        frames.push(frame);
        return frame;
      }),
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: vi.fn(), enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    const worker = workerHarness.instances[workerHarness.instances.length - 1];
    act(() => animation.runLatest());
    const firstRequest = worker.postedMessages[worker.postedMessages.length - 1];
    expect(canvas).toMatchObject({ width: 1280, height: 720 });
    expect(worker.transferLists[worker.transferLists.length - 1]).toEqual([
      frames[frames.length - 1].data.buffer,
    ]);
    act(() => {
      worker.emitMessage({
        found: false,
        requestId: firstRequest.requestId,
        scannerId: firstRequest.scannerId,
        sessionId: firstRequest.sessionId,
      });
    });

    await act(async () => hook.result.current.handleSwitchCamera());
    act(() => animation.runLatest());

    expect(canvas).toMatchObject({ width: 720, height: 1280 });
    expect(worker.postedMessages[worker.postedMessages.length - 1]?.region).toBe("full");
    expect(context.drawImage.mock.calls[context.drawImage.mock.calls.length - 1]).toHaveLength(5);

    hook.unmount();
    restoreMediaDevices();
  });

  it("bounds zero-dimension video readiness instead of spinning forever", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const animation = installAnimationHarness();
    const onError = vi.fn();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 0, height: 0 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 0,
      videoHeight: 0,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError, enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    act(() => animation.runLatest());
    vi.setSystemTime(5_000);
    act(() => animation.runLatest());

    expect(onError).toHaveBeenCalledWith(
      new Error("The camera did not provide a usable video frame"),
    );
    expect(track.stop).toHaveBeenCalledOnce();
    expect(hook.result.current.scannerState.isScanning).toBe(false);

    hook.unmount();
    restoreMediaDevices();
  });

  it("waits for current video data before capturing a frame", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const animation = installAnimationHarness();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      readyState: HTMLMediaElement.HAVE_METADATA as number,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(640 * 480 * 4),
          width: 640,
          height: 480,
        })),
      })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: vi.fn(), enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    const worker = workerHarness.instances[workerHarness.instances.length - 1];
    const initialMessageCount = worker.postedMessages.length;
    act(() => animation.runLatest());
    expect(worker.postedMessages).toHaveLength(initialMessageCount);

    video.readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
    vi.setSystemTime(100);
    act(() => animation.runLatest());
    expect(worker.postedMessages).toHaveLength(initialMessageCount + 1);

    hook.unmount();
    restoreMediaDevices();
  });

  it("reports repeated capture failures and releases the camera", async () => {
    const animation = installAnimationHarness();
    const onError = vi.fn();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(() => {
          throw new DOMException("The video frame is unavailable", "InvalidStateError");
        }),
        getImageData: vi.fn(),
      })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError, enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    for (let attempt = 0; attempt < 5; attempt++) act(() => animation.runLatest());

    expect(onError).toHaveBeenCalledWith(
      new Error("Camera frame capture failed repeatedly: The video frame is unavailable"),
    );
    expect(track.stop).toHaveBeenCalledOnce();
    expect(hook.result.current.scannerState.isScanning).toBe(false);

    hook.unmount();
    restoreMediaDevices();
  });

  it("recreates a failed worker and reports protocol and construction errors", async () => {
    const onError = vi.fn();
    const hook = renderHook(() => useScanner({ onScan: vi.fn(), onError, enableVibration: false }));
    const firstWorker = workerHarness.instances[workerHarness.instances.length - 1];

    act(() => firstWorker.emitError("The worker crashed"));
    const secondWorker = workerHarness.instances[workerHarness.instances.length - 1];
    expect(secondWorker).not.toBe(firstWorker);
    expect(firstWorker.terminateCalls).toBe(1);
    expect(onError).toHaveBeenNthCalledWith(1, new Error("The worker crashed"));

    act(() => secondWorker.emitMessageError());
    expect(secondWorker.terminateCalls).toBe(1);
    expect(onError).toHaveBeenNthCalledWith(
      2,
      new Error("The barcode decoder worker returned an unreadable message"),
    );

    workerHarness.constructorError = new Error("Worker construction blocked");
    await act(async () => hook.result.current.handleScan());
    expect(onError).toHaveBeenNthCalledWith(3, new Error("Worker construction blocked"));

    hook.unmount();
  });

  it("invalidates one shared worker once when a response is malformed", () => {
    const firstOnError = vi.fn();
    const secondOnError = vi.fn();
    const first = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: firstOnError, enableVibration: false }),
    );
    const second = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: secondOnError, enableVibration: false }),
    );
    const failedWorker = workerHarness.instances[workerHarness.instances.length - 1];
    const instanceCount = workerHarness.instances.length;

    act(() => failedWorker.emitMessage(null));

    expect(failedWorker.terminateCalls).toBe(1);
    expect(workerHarness.instances).toHaveLength(instanceCount + 1);
    expect(firstOnError).toHaveBeenCalledWith(
      new Error("The barcode decoder worker returned an unreadable message"),
    );
    expect(secondOnError).toHaveBeenCalledWith(
      new Error("The barcode decoder worker returned an unreadable message"),
    );

    first.unmount();
    second.unmount();
  });

  it("invalidates and recreates a worker that stops responding", async () => {
    vi.useFakeTimers();
    const animation = installAnimationHarness();
    const onError = vi.fn();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(640 * 480 * 4),
          width: 640,
          height: 480,
        })),
      })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError, enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    const failedWorker = workerHarness.instances[workerHarness.instances.length - 1];
    act(() => animation.runLatest());
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(failedWorker.terminateCalls).toBe(1);
    expect(workerHarness.instances[workerHarness.instances.length - 1]).not.toBe(failedWorker);
    expect(onError).toHaveBeenCalledWith(
      new Error("The barcode decoder worker did not respond in time"),
    );
    expect(track.stop).toHaveBeenCalledOnce();

    hook.unmount();
    restoreMediaDevices();
  });

  it("reports an active track ending but ignores an ended event after explicit stop", async () => {
    const animation = installAnimationHarness();
    const onError = vi.fn();
    const listeners: Array<(() => void) | undefined> = [];
    const createMedia = () => {
      let endedListener: (() => void) | undefined;
      const track = {
        stop: vi.fn(),
        getSettings: () => ({ width: 640, height: 480 }),
        getCapabilities: () => ({ torch: false }),
        addEventListener: vi.fn((type: string, listener: () => void) => {
          if (type === "ended") endedListener = listener;
        }),
        removeEventListener: vi.fn(),
      };
      const stream = {
        getTracks: () => [track],
        getVideoTracks: () => [track],
      } as unknown as MediaStream;
      listeners.push(() => endedListener?.());
      return { stream, track };
    };
    const first = createMedia();
    const second = createMedia();
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi
        .fn()
        .mockResolvedValueOnce(first.stream)
        .mockResolvedValueOnce(second.stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError, enableVibration: false, scanInterval: 0 }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    act(() => hook.result.current.handleStopScan());
    act(() => listeners[0]?.());
    expect(onError).not.toHaveBeenCalled();

    await act(async () => hook.result.current.handleScan());
    act(() => listeners[1]?.());
    expect(onError).toHaveBeenCalledWith(new Error("The active camera stream ended unexpectedly"));
    expect(second.track.stop).toHaveBeenCalledOnce();
    expect(hook.result.current.scannerState.isScanning).toBe(false);

    hook.unmount();
    restoreMediaDevices();
    void animation;
  });

  it("releases the active camera on pagehide without reporting a failure", async () => {
    installAnimationHarness();
    const onError = vi.fn();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const hook = renderHook(() => useScanner({ onScan: vi.fn(), onError, enableVibration: false }));
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(hook.result.current.scannerState.isScanning).toBe(false);
    expect(onError).not.toHaveBeenCalled();

    hook.unmount();
    restoreMediaDevices();
  });

  it("cancels a pending camera request when the page is hidden", async () => {
    const onError = vi.fn();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    let resolveCamera: ((stream: MediaStream) => void) | undefined;
    const cameraRequest = new Promise<MediaStream>((resolve) => {
      resolveCamera = resolve;
    });
    const getUserMedia = vi.fn(() => cameraRequest);
    const restoreMediaDevices = setMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = { srcObject: null, play: vi.fn(), pause: vi.fn() };
    const canvas = { getContext: vi.fn() };
    const hook = renderHook(() => useScanner({ onScan: vi.fn(), onError, enableVibration: false }));
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    let startPromise: Promise<void> | undefined;
    act(() => {
      startPromise = hook.result.current.handleScan();
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await act(async () => {
      resolveCamera?.(stream);
      await startPromise;
    });

    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(hook.result.current.scannerState.isScanning).toBe(false);
    expect(onError).not.toHaveBeenCalled();

    hook.unmount();
    restoreMediaDevices();
  });

  it("normalizes a non-finite scan interval to the safe default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const animation = installAnimationHarness();
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(640 * 480 * 4),
          width: 640,
          height: 480,
        })),
      })),
    };
    const hook = renderHook(() =>
      useScanner({
        onScan: vi.fn(),
        onError: vi.fn(),
        enableVibration: false,
        scanInterval: Number.POSITIVE_INFINITY,
      }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    const worker = workerHarness.instances[workerHarness.instances.length - 1];
    const initialMessageCount = worker.postedMessages.length;
    act(() => animation.runLatest());
    vi.setSystemTime(99);
    act(() => animation.runLatest());
    expect(worker.postedMessages).toHaveLength(initialMessageCount);

    vi.setSystemTime(100);
    act(() => animation.runLatest());
    expect(worker.postedMessages).toHaveLength(initialMessageCount + 1);

    hook.unmount();
    restoreMediaDevices();
  });

  it("does not apply a stale torch result after camera switching", async () => {
    installAnimationHarness();
    let resolveTorch: (() => void) | undefined;
    const applyConstraints = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTorch = resolve;
        }),
    );
    const firstTrack = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    const secondTrack = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const firstStream = {
      getTracks: () => [firstTrack],
      getVideoTracks: () => [firstTrack],
    } as unknown as MediaStream;
    const secondStream = {
      getTracks: () => [secondTrack],
      getVideoTracks: () => [secondTrack],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn().mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream),
      enumerateDevices: vi.fn(async () => [
        { kind: "videoinput", deviceId: "rear" },
        { kind: "videoinput", deviceId: "front" },
      ]),
    } as unknown as MediaDevices);
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const onError = vi.fn();
    const hook = renderHook(() => useScanner({ onScan: vi.fn(), onError, enableVibration: false }));
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    let togglePromise: Promise<void> | undefined;
    act(() => {
      togglePromise = hook.result.current.handleToggleTorch();
    });
    await waitFor(() => expect(applyConstraints).toHaveBeenCalledOnce());
    await act(async () => hook.result.current.handleSwitchCamera());
    await act(async () => {
      resolveTorch?.();
      await togglePromise;
    });

    expect(hook.result.current.scannerState.isTorchOn).toBe(false);
    expect(onError).not.toHaveBeenCalled();

    hook.unmount();
    restoreMediaDevices();
  });

  it("does not apply a stale torch result after explicit stop", async () => {
    let resolveTorch: (() => void) | undefined;
    const applyConstraints = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTorch = resolve;
        }),
    );
    const track = {
      stop: vi.fn(),
      getCapabilities: () => ({ torch: true }),
      applyConstraints,
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = { srcObject: stream as MediaStream | null, pause: vi.fn() };
    const onError = vi.fn();
    const hook = renderHook(() => useScanner({ onScan: vi.fn(), onError, enableVibration: false }));
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;

    let togglePromise: Promise<void> | undefined;
    act(() => {
      togglePromise = hook.result.current.handleToggleTorch();
    });
    await waitFor(() => expect(applyConstraints).toHaveBeenCalledOnce());
    act(() => hook.result.current.handleStopScan());
    await act(async () => {
      resolveTorch?.();
      await togglePromise;
    });

    expect(hook.result.current.scannerState.isTorchOn).toBe(false);
    expect(onError).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("uses video-frame scheduling when available and cancels it on stop", async () => {
    const requestAnimationFrameMock = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const track = {
      stop: vi.fn(),
      getSettings: () => ({ width: 640, height: 480 }),
      getCapabilities: () => ({ torch: false }),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const restoreMediaDevices = setMediaDevices({
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices);
    const requestVideoFrameCallback = vi.fn(() => 41);
    const cancelVideoFrameCallback = vi.fn();
    const video = {
      srcObject: null,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      requestVideoFrameCallback,
      cancelVideoFrameCallback,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), getImageData: vi.fn() })),
    };
    const hook = renderHook(() =>
      useScanner({ onScan: vi.fn(), onError: vi.fn(), enableVibration: false }),
    );
    hook.result.current.videoRef.current = video as unknown as HTMLVideoElement;
    hook.result.current.canvasRef.current = canvas as unknown as HTMLCanvasElement;

    await act(async () => hook.result.current.handleScan());
    expect(requestVideoFrameCallback).toHaveBeenCalledOnce();
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();

    act(() => hook.result.current.handleStopScan());
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(41);

    hook.unmount();
    restoreMediaDevices();
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
