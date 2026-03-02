import { memo } from "react";
import { IconRotateCamera, IconTorchOff, IconTorchOn } from "./Icons";

interface ScannerControlsProps {
  isScanning: boolean;
  isTorchOn: boolean;
  shouldShowRotateButton: boolean;
  shouldShowTorchButton: boolean;
  onSwitchCamera: () => void;
  onToggleTorch: () => void;
}

/**
 * Scanner control buttons component (camera rotate and torch)
 */
const ScannerControls = ({
  isScanning,
  isTorchOn,
  shouldShowRotateButton,
  shouldShowTorchButton,
  onSwitchCamera,
  onToggleTorch,
}: ScannerControlsProps) => {
  if (!isScanning) return null;
  if (!shouldShowRotateButton && !shouldShowTorchButton) return null;

  return (
    <div className="mbs-controls">
      {/* Rotate Camera Button */}
      {shouldShowRotateButton && (
        <button
          type="button"
          className="mbs-control-btn"
          onClick={onSwitchCamera}
          aria-label="Switch camera"
        >
          <IconRotateCamera className="mbs-icon" />
        </button>
      )}

      {/* Torch Button */}
      {shouldShowTorchButton && (
        <button
          type="button"
          className="mbs-control-btn"
          onClick={onToggleTorch}
          aria-label={isTorchOn ? "Turn off torch" : "Turn on torch"}
        >
          {isTorchOn ? <IconTorchOff className="mbs-icon" /> : <IconTorchOn className="mbs-icon" />}
        </button>
      )}
    </div>
  );
};

export default memo(ScannerControls);
