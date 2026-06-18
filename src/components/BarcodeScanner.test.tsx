import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

// The real hook spins up a Web Worker + camera stream, neither of which exists
// in jsdom. Stub it so we can assert the component's own rendering/wiring.
const mockScannerApi = vi.hoisted(() => ({
  scannerState: { isScanning: false, facingMode: "environment", isTorchOn: false },
  videoRef: { current: null },
  canvasRef: { current: null },
  handleScan: vi.fn(),
  handleStopScan: vi.fn(),
  handleSwitchCamera: vi.fn(),
  handleToggleTorch: vi.fn(),
}));

vi.mock("../hooks/useScanner", () => ({
  useScanner: () => mockScannerApi,
}));

import BarcodeScanner from "./BarcodeScanner";

describe("BarcodeScanner", () => {
  it("renders the viewfinder with the video element", () => {
    const { container } = render(<BarcodeScanner onScan={vi.fn()} />);
    expect(container.querySelector(".mbs-container")).not.toBeNull();
    expect(container.querySelector("video.mbs-video")).not.toBeNull();
  });

  it("applies the themeColor as the --mbs-primary CSS variable", () => {
    const { container } = render(<BarcodeScanner onScan={vi.fn()} themeColor="#2563EB" />);
    const root = container.querySelector(".mbs-container") as HTMLElement;
    expect(root.style.getPropertyValue("--mbs-primary")).toBe("#2563EB");
  });

  it("forwards a custom className onto the container", () => {
    const { container } = render(<BarcodeScanner onScan={vi.fn()} className="my-scanner" />);
    expect(container.querySelector(".mbs-container.my-scanner")).not.toBeNull();
  });
});
