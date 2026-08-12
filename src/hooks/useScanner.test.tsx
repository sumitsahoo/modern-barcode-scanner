import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

interface MockWorkerInstance {
  emitMessage: (data: unknown) => void;
}

const workerHarness = vi.hoisted(() => ({
  instances: [] as MockWorkerInstance[],
}));

vi.mock("../workers/scanner.worker.ts?worker&inline", () => ({
  default: class MockScannerWorker {
    private readonly messageListeners = new Set<(event: MessageEvent) => void>();

    constructor() {
      workerHarness.instances.push(this);
    }

    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") this.messageListeners.add(listener);
    }

    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === "message") this.messageListeners.delete(listener);
    }

    emitMessage(data: unknown) {
      for (const listener of this.messageListeners) {
        listener({ data } as MessageEvent);
      }
    }

    terminate() {}
  },
}));

import { useScanner } from "./useScanner";

describe("useScanner shared worker routing", () => {
  it("delivers results and decode errors only to the originating scanner", () => {
    const firstOnScan = vi.fn();
    const firstOnError = vi.fn();
    const secondOnScan = vi.fn();
    const secondOnError = vi.fn();

    const first = renderHook(() =>
      useScanner({
        onScan: firstOnScan,
        onError: firstOnError,
        enableVibration: false,
      }),
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

    act(() => {
      worker.emitMessage({
        found: true,
        scannerId: 1,
        sessionId: 0,
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
});
