import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

// The real hook spins up a Web Worker + camera stream, neither of which exists
// in jsdom. Stub it so we can assert the component's own rendering/wiring.
const mockScannerApi = vi.hoisted(() => ({
  scannerState: {
    isStarting: false,
    isScanning: false,
    facingMode: "environment",
    isTorchOn: false,
    isTorchSupported: false,
    canSwitchCamera: false,
  },
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

  it("announces the stopped state to assistive technology", () => {
    render(<BarcodeScanner onScan={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Barcode scanner stopped");
  });

  it("shows a focused viewfinder guide while scanning", () => {
    mockScannerApi.scannerState.isScanning = true;
    const { container } = render(<BarcodeScanner onScan={vi.fn()} />);

    expect(container.querySelector(".mbs-viewfinder-frame")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Barcode scanner active");

    mockScannerApi.scannerState.isScanning = false;
  });

  it("announces camera startup without showing active-only controls", () => {
    mockScannerApi.scannerState.isStarting = true;
    const { container } = render(<BarcodeScanner onScan={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Starting barcode scanner");
    expect(container.querySelector(".mbs-viewfinder-frame")).toBeNull();
    expect(screen.queryByLabelText("Switch camera")).toBeNull();

    mockScannerApi.scannerState.isStarting = false;
  });

  it("shows only controls supported by the active camera", () => {
    mockScannerApi.scannerState.isScanning = true;
    mockScannerApi.scannerState.canSwitchCamera = true;
    mockScannerApi.scannerState.isTorchSupported = false;
    const { rerender } = render(<BarcodeScanner onScan={vi.fn()} />);

    expect(screen.getByLabelText("Switch camera")).toBeInTheDocument();
    expect(screen.queryByLabelText("Turn on torch")).toBeNull();

    mockScannerApi.scannerState.canSwitchCamera = false;
    mockScannerApi.scannerState.isTorchSupported = true;
    rerender(<BarcodeScanner onScan={vi.fn()} />);

    expect(screen.queryByLabelText("Switch camera")).toBeNull();
    expect(screen.getByLabelText("Turn on torch")).toBeInTheDocument();

    mockScannerApi.scannerState.isScanning = false;
    mockScannerApi.scannerState.isTorchSupported = false;
  });

  it("honors consumer overrides that hide optional visuals", () => {
    mockScannerApi.scannerState.isScanning = true;
    mockScannerApi.scannerState.canSwitchCamera = true;
    mockScannerApi.scannerState.isTorchSupported = true;
    const { container } = render(
      <BarcodeScanner
        onScan={vi.fn()}
        showScanLine={false}
        showCameraSwitch={false}
        showTorchButton={false}
      />,
    );

    expect(container.querySelector(".mbs-scan-line-container")).toBeNull();
    expect(screen.queryByLabelText("Switch camera")).toBeNull();
    expect(screen.queryByLabelText("Turn on torch")).toBeNull();

    mockScannerApi.scannerState.isScanning = false;
    mockScannerApi.scannerState.canSwitchCamera = false;
    mockScannerApi.scannerState.isTorchSupported = false;
  });
});
