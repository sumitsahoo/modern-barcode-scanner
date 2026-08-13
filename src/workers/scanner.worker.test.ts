import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const decoderMock = vi.hoisted(() => ({
  decodeFirstBarcode: vi.fn(),
}));

vi.mock("../decoders/decodeBarcode", () => decoderMock);

import type { WorkerMessage } from "./scanner.worker";
import { FrameQualityEstimator } from "../utils/frameQuality";
import "./scanner.worker";

const checkerboardFrame = (): ImageData => {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = (x + y) % 2 === 0 ? 12 : 243;
      const offset = (y * width + x) * 4;
      data.set([value, value, value, 255], offset);
    }
  }
  return { data, width, height } as ImageData;
};

describe("scanner worker queue", () => {
  const originalPostMessage = self.postMessage;

  afterEach(() => {
    decoderMock.decodeFirstBarcode.mockReset();
    self.postMessage = originalPostMessage;
    vi.restoreAllMocks();
  });

  it("serializes decode jobs that share the WASM scanner", async () => {
    let resolveFirst: ((value: null) => void) | undefined;
    const firstDecode = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    decoderMock.decodeFirstBarcode
      .mockImplementationOnce(() => firstDecode)
      .mockResolvedValueOnce(null);
    self.postMessage = vi.fn();

    const message = (scannerId: number): WorkerMessage => ({
      type: "scan",
      scannerId,
      sessionId: 1,
      requestId: 0,
      imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData,
    });

    self.onmessage?.({ data: message(1) } as MessageEvent);
    self.onmessage?.({ data: message(2) } as MessageEvent);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(1));

    resolveFirst?.(null);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(2));

    expect(self.postMessage).toHaveBeenNthCalledWith(1, {
      found: false,
      scannerId: 1,
      sessionId: 1,
      requestId: 0,
    });
    expect(self.postMessage).toHaveBeenNthCalledWith(2, {
      found: false,
      scannerId: 2,
      sessionId: 1,
      requestId: 0,
    });
  });

  it("uses an enhanced decoding pass after two fast misses", async () => {
    decoderMock.decodeFirstBarcode.mockResolvedValue(null);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 100,
      sessionId: 7,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "viewfinder",
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      self.onmessage?.({ data: { ...message, attempt, requestId: attempt } } as MessageEvent);
      await vi.waitFor(() =>
        expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(attempt + 1),
      );
      await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(attempt + 1));
    }

    expect(decoderMock.decodeFirstBarcode.mock.calls.map((call) => call[1])).toEqual([
      { tryHarder: false },
      { tryHarder: false },
      { tryHarder: true },
    ]);
  });

  it("skips low-quality viewfinder frames but preserves full-frame recovery", async () => {
    decoderMock.decodeFirstBarcode.mockResolvedValue(null);
    self.postMessage = vi.fn();
    const imageData = {
      data: new Uint8ClampedArray(16 * 16 * 4).fill(128),
      width: 16,
      height: 16,
    } as ImageData;
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 101,
      sessionId: 1,
      requestId: 0,
      imageData,
      region: "viewfinder",
    };

    self.onmessage?.({ data: message } as MessageEvent);
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(1));
    expect(decoderMock.decodeFirstBarcode).not.toHaveBeenCalled();

    self.onmessage?.({ data: { ...message, region: "full", requestId: 1 } } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(2));
    expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledWith(imageData, { tryHarder: true });
  });

  it("absorbs an isolated raw engine exception and recovers on the next frame", async () => {
    decoderMock.decodeFirstBarcode.mockRejectedValueOnce(1_359_896).mockResolvedValueOnce(null);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 102,
      sessionId: 1,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "full",
    };

    self.onmessage?.({ data: message } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledOnce());
    self.onmessage?.({ data: { ...message, attempt: 1, requestId: 1 } } as MessageEvent);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(2));
    expect(self.postMessage).toHaveBeenNthCalledWith(1, {
      found: false,
      scannerId: 102,
      sessionId: 1,
      requestId: 0,
    });
    expect(self.postMessage).toHaveBeenNthCalledWith(2, {
      found: false,
      scannerId: 102,
      sessionId: 1,
      requestId: 1,
    });
  });

  it("reports a clear error only after repeated decoder failures", async () => {
    decoderMock.decodeFirstBarcode.mockRejectedValue(1_359_896);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 103,
      sessionId: 1,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "full",
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      self.onmessage?.({ data: { ...message, attempt, requestId: attempt } } as MessageEvent);
      await vi.waitFor(() =>
        expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(attempt + 1),
      );
      await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(attempt + 1));
    }

    expect(self.postMessage).toHaveBeenLastCalledWith({
      found: false,
      scannerId: 103,
      sessionId: 1,
      requestId: 2,
      error:
        "Barcode decoding failed repeatedly: Barcode engine reported an internal frame exception",
    });
  });

  it("reports deterministic decoder failures immediately and resets transient state", async () => {
    decoderMock.decodeFirstBarcode
      .mockRejectedValueOnce(1_359_896)
      .mockRejectedValueOnce(new RangeError("invalid decoder frame"))
      .mockRejectedValueOnce(1_359_896);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 107,
      sessionId: 1,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "full",
    };

    for (let requestId = 0; requestId < 3; requestId++) {
      self.onmessage?.({ data: { ...message, requestId } } as MessageEvent);
      await vi.waitFor(() =>
        expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(requestId + 1),
      );
      await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(requestId + 1));
    }

    expect(self.postMessage).toHaveBeenNthCalledWith(2, {
      found: false,
      scannerId: 107,
      sessionId: 1,
      requestId: 1,
      error: "Barcode decoding failed: invalid decoder frame",
    });
    expect(self.postMessage).toHaveBeenNthCalledWith(3, {
      found: false,
      scannerId: 107,
      sessionId: 1,
      requestId: 2,
    });
  });

  it("rejects malformed correlated messages and keeps the queue usable", async () => {
    decoderMock.decodeFirstBarcode.mockResolvedValue(null);
    self.postMessage = vi.fn();

    self.onmessage?.({ data: null } as MessageEvent);
    self.onmessage?.({
      data: {
        type: "scan",
        scannerId: 104,
        sessionId: 1,
        requestId: 0,
        region: "sideways",
        imageData: checkerboardFrame(),
      },
    } as MessageEvent);

    expect(self.postMessage).toHaveBeenCalledWith({
      found: false,
      scannerId: 104,
      sessionId: 1,
      requestId: 0,
      error: "Invalid scanner worker request",
    });
    expect(decoderMock.decodeFirstBarcode).not.toHaveBeenCalled();

    self.onmessage?.({
      data: {
        type: "scan",
        scannerId: 104,
        sessionId: 1,
        requestId: 1,
        imageData: checkerboardFrame(),
      } satisfies WorkerMessage,
    } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(2));
    expect(self.postMessage).toHaveBeenLastCalledWith({
      found: false,
      scannerId: 104,
      sessionId: 1,
      requestId: 1,
    });
  });

  it("drops superseded, duplicate, and older-session requests", async () => {
    let resolveFirst: ((value: null) => void) | undefined;
    const firstDecode = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    decoderMock.decodeFirstBarcode
      .mockImplementationOnce(() => firstDecode)
      .mockResolvedValueOnce(null);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 105,
      sessionId: 2,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "full",
    };

    self.onmessage?.({ data: message } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    self.onmessage?.({ data: { ...message, requestId: 1 } } as MessageEvent);
    self.onmessage?.({ data: { ...message, requestId: 1 } } as MessageEvent);
    self.onmessage?.({ data: { ...message, sessionId: 1, requestId: 2 } } as MessageEvent);
    resolveFirst?.(null);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledOnce());
    expect(self.postMessage).toHaveBeenCalledWith({
      found: false,
      scannerId: 105,
      sessionId: 2,
      requestId: 1,
    });
  });

  it("does not score periodic full frames", async () => {
    decoderMock.decodeFirstBarcode.mockResolvedValue(null);
    self.postMessage = vi.fn();
    const evaluate = vi.spyOn(FrameQualityEstimator.prototype, "evaluate");

    self.onmessage?.({
      data: {
        type: "scan",
        scannerId: 106,
        sessionId: 1,
        requestId: 0,
        imageData: checkerboardFrame(),
        region: "full",
      } satisfies WorkerMessage,
    } as MessageEvent);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledOnce());
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("preserves accepted work when every scanner slot is pending", async () => {
    let resolveFirst: ((value: null) => void) | undefined;
    const firstDecode = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    decoderMock.decodeFirstBarcode
      .mockImplementationOnce(() => firstDecode)
      .mockResolvedValue(null);
    self.postMessage = vi.fn();

    const message = (scannerId: number): WorkerMessage => ({
      type: "scan",
      scannerId,
      sessionId: 1,
      requestId: 0,
      imageData: checkerboardFrame(),
      region: "full",
    });

    for (let scannerId = 10_000; scannerId < 10_016; scannerId++) {
      self.onmessage?.({ data: message(scannerId) } as MessageEvent);
    }
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());

    self.onmessage?.({ data: message(10_016) } as MessageEvent);
    expect(self.postMessage).toHaveBeenCalledWith({
      found: false,
      scannerId: 10_016,
      sessionId: 1,
      requestId: 0,
      error: "Scanner worker capacity reached",
    });
    expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce();

    resolveFirst?.(null);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(16));
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(17));
    for (let scannerId = 10_000; scannerId < 10_016; scannerId++) {
      expect(self.postMessage).toHaveBeenCalledWith({
        found: false,
        scannerId,
        sessionId: 1,
        requestId: 0,
      });
    }

    self.onmessage?.({ data: message(10_017) } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(17));
    await vi.waitFor(() =>
      expect(self.postMessage).toHaveBeenCalledWith({
        found: false,
        scannerId: 10_017,
        sessionId: 1,
        requestId: 0,
      }),
    );
  });
});
