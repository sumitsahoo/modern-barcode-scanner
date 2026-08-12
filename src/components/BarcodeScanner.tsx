import { forwardRef, useEffect, useImperativeHandle } from "react";
import { useScanner } from "../hooks/useScanner";
import { SCANNER_THEME } from "../constants/theme";
import type { BarcodeScannerProps, BarcodeScannerRef, ScannerState } from "../types";
import { IconScanFrame } from "./Icons";
import ScanLine from "./ScanLine";
import ScannerControls from "./ScannerControls";

/**
 * BarcodeScanner Component
 *
 * A high-performance barcode scanner React component with optimized detection.
 * Supports capability-aware camera switching and torch control.
 *
 * @example
 * ```tsx
 * import { BarcodeScanner, BarcodeScannerRef } from 'modern-barcode-scanner';
 * import 'modern-barcode-scanner/styles.css';
 *
 * const App = () => {
 *   const scannerRef = useRef<BarcodeScannerRef>(null);
 *
 *   const handleScan = (result) => {
 *     console.log('Scanned:', result.scanData);
 *   };
 *
 *   useEffect(() => {
 *     // Start scanning when component mounts
 *     scannerRef.current?.start();
 *   }, []);
 *
 *   return (
 *     <BarcodeScanner
 *       ref={scannerRef}
 *       onScan={handleScan}
 *     />
 *   );
 * };
 * ```
 */
const BarcodeScanner = forwardRef<BarcodeScannerRef, BarcodeScannerProps>(
  (
    {
      onScan,
      onError,
      onStateChange,
      scanInterval,
      enableVibration = true,
      vibrationDuration,
      enableSound = false,
      initialFacingMode = "environment",
      className = "",
      showScanLine = true,
      showCameraSwitch = true,
      showTorchButton = true,
      style,
      themeColor = SCANNER_THEME.primary,
    },
    ref,
  ) => {
    const {
      scannerState,
      videoRef,
      canvasRef,
      viewfinderRef,
      handleScan,
      handleStopScan,
      handleSwitchCamera,
      handleToggleTorch,
    } = useScanner({
      onScan,
      onError,
      onStateChange,
      scanInterval,
      enableVibration,
      vibrationDuration,
      enableSound,
      initialFacingMode,
    });

    const { isStarting, isScanning, facingMode, isTorchOn, isTorchSupported, canSwitchCamera } =
      scannerState;

    // Expose imperative methods via ref
    useImperativeHandle(
      ref,
      () => ({
        start: handleScan,
        stop: handleStopScan,
        switchCamera: handleSwitchCamera,
        toggleTorch: handleToggleTorch,
        getState: (): ScannerState => scannerState,
      }),
      [handleScan, handleStopScan, handleSwitchCamera, handleToggleTorch, scannerState],
    );

    // Auto-cleanup on unmount
    useEffect(() => {
      return () => {
        handleStopScan();
      };
    }, [handleStopScan]);

    // Combine user styles with the custom theme color CSS variable
    const containerStyle = {
      ...style,
      "--mbs-primary": themeColor,
    } as React.CSSProperties;

    return (
      <div
        className={`mbs-container ${className}`}
        style={containerStyle}
        data-scanning={isScanning}
        data-state={isStarting ? "starting" : isScanning ? "scanning" : "stopped"}
      >
        {/* Camera Feed */}
        <section
          className="mbs-video-container"
          aria-label="Barcode scanner viewfinder"
          aria-busy={isStarting}
        >
          <IconScanFrame className="mbs-placeholder-icon" />
          <video
            title="Barcode Scanner"
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="mbs-video"
          />
          {isScanning && (
            <div ref={viewfinderRef} className="mbs-viewfinder-frame" aria-hidden="true">
              <div className="mbs-viewfinder-viewport">
                <ScanLine visible={showScanLine} />
              </div>
              <span className="mbs-viewfinder-hint">Align the barcode inside the frame</span>
            </div>
          )}
        </section>

        <span className="mbs-sr-only" role="status">
          {isStarting
            ? "Starting barcode scanner"
            : isScanning
              ? "Barcode scanner active"
              : "Barcode scanner stopped"}
        </span>

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} hidden />

        {/* Camera Controls */}
        <ScannerControls
          isScanning={isScanning}
          isTorchOn={isTorchOn}
          shouldShowRotateButton={showCameraSwitch && isScanning && canSwitchCamera}
          shouldShowTorchButton={
            showTorchButton && isScanning && isTorchSupported && facingMode === "environment"
          }
          onSwitchCamera={handleSwitchCamera}
          onToggleTorch={handleToggleTorch}
        />
      </div>
    );
  },
);

BarcodeScanner.displayName = "BarcodeScanner";

export default BarcodeScanner;
