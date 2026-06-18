import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import ScannerControls from "./ScannerControls";

const baseProps = {
  isScanning: true,
  isTorchOn: false,
  shouldShowRotateButton: true,
  shouldShowTorchButton: true,
  onSwitchCamera: vi.fn(),
  onToggleTorch: vi.fn(),
};

describe("ScannerControls", () => {
  it("renders nothing while not scanning", () => {
    const { container } = render(<ScannerControls {...baseProps} isScanning={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when both buttons are hidden", () => {
    const { container } = render(
      <ScannerControls
        {...baseProps}
        shouldShowRotateButton={false}
        shouldShowTorchButton={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("invokes onSwitchCamera when the rotate button is clicked", () => {
    const onSwitchCamera = vi.fn();
    render(
      <ScannerControls
        {...baseProps}
        shouldShowTorchButton={false}
        onSwitchCamera={onSwitchCamera}
      />,
    );
    fireEvent.click(screen.getByLabelText("Switch camera"));
    expect(onSwitchCamera).toHaveBeenCalledOnce();
  });

  it("invokes onToggleTorch and reflects torch state in the aria-label", () => {
    const onToggleTorch = vi.fn();
    const { rerender } = render(
      <ScannerControls
        {...baseProps}
        shouldShowRotateButton={false}
        onToggleTorch={onToggleTorch}
      />,
    );

    fireEvent.click(screen.getByLabelText("Turn on torch"));
    expect(onToggleTorch).toHaveBeenCalledOnce();

    rerender(
      <ScannerControls
        {...baseProps}
        shouldShowRotateButton={false}
        isTorchOn={true}
        onToggleTorch={onToggleTorch}
      />,
    );
    expect(screen.getByLabelText("Turn off torch")).toBeTruthy();
  });
});
