import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const decoderMock = vi.hoisted(() => ({
  decodeFirstBarcode: vi.fn(),
}));

vi.mock("../decoders/decodeBarcode", () => decoderMock);

import type { WorkerMessage } from "./scanner.worker";
import "./scanner.worker";

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
});
