import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const decoderMock = vi.hoisted(() => ({
  decodeFirstBarcode: vi.fn(),
}));

vi.mock("../decoders/decodeBarcode", () => decoderMock);

import type { WorkerMessage } from "./scanner.worker";
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
    });
    expect(self.postMessage).toHaveBeenNthCalledWith(2, {
      found: false,
      scannerId: 2,
      sessionId: 1,
    });
  });

  it("uses an enhanced decoding pass after two fast misses", async () => {
    decoderMock.decodeFirstBarcode.mockResolvedValue(null);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 100,
      sessionId: 7,
      imageData: checkerboardFrame(),
      region: "viewfinder",
    };

    self.onmessage?.({ data: { ...message, attempt: 0 } } as MessageEvent);
    self.onmessage?.({ data: { ...message, attempt: 1 } } as MessageEvent);
    self.onmessage?.({ data: { ...message, attempt: 2 } } as MessageEvent);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(3));
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
      imageData,
      region: "viewfinder",
    };

    self.onmessage?.({ data: message } as MessageEvent);
    await vi.waitFor(() => expect(self.postMessage).toHaveBeenCalledTimes(1));
    expect(decoderMock.decodeFirstBarcode).not.toHaveBeenCalled();

    self.onmessage?.({ data: { ...message, region: "full" } } as MessageEvent);
    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledOnce());
    expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledWith(imageData, { tryHarder: true });
  });

  it("absorbs an isolated raw engine exception and recovers on the next frame", async () => {
    decoderMock.decodeFirstBarcode.mockRejectedValueOnce(1_359_896).mockResolvedValueOnce(null);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 102,
      sessionId: 1,
      imageData: checkerboardFrame(),
      region: "full",
    };

    self.onmessage?.({ data: message } as MessageEvent);
    self.onmessage?.({ data: { ...message, attempt: 1 } } as MessageEvent);

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(2));
    expect(self.postMessage).toHaveBeenNthCalledWith(1, {
      found: false,
      scannerId: 102,
      sessionId: 1,
    });
    expect(self.postMessage).toHaveBeenNthCalledWith(2, {
      found: false,
      scannerId: 102,
      sessionId: 1,
    });
  });

  it("reports a clear error only after repeated decoder failures", async () => {
    decoderMock.decodeFirstBarcode.mockRejectedValue(1_359_896);
    self.postMessage = vi.fn();
    const message: WorkerMessage = {
      type: "scan",
      scannerId: 103,
      sessionId: 1,
      imageData: checkerboardFrame(),
      region: "full",
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      self.onmessage?.({ data: { ...message, attempt } } as MessageEvent);
    }

    await vi.waitFor(() => expect(decoderMock.decodeFirstBarcode).toHaveBeenCalledTimes(3));
    expect(self.postMessage).toHaveBeenLastCalledWith({
      found: false,
      scannerId: 103,
      sessionId: 1,
      error:
        "Barcode decoding failed repeatedly: Barcode engine reported an internal frame exception",
    });
  });
});
