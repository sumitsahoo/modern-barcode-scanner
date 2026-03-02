import { forwardRef, useEffect, useImperativeHandle } from "react";
import { useScanner } from "../hooks/useScanner";
import { SCANNER_THEME } from "../constants/theme";
import type { BarcodeScannerProps, BarcodeScannerRef, ScannerState } from "../types";
import { isPhone } from "../utils/barcodeHelpers";
import { IconCameraPlaceholder } from "./Icons";
import ScanLine from "./ScanLine";
import ScannerControls from "./ScannerControls";

/**
 * BarcodeScanner Component
 *
 * A high-performance barcode scanner React component with optimized detection.
 * Supports camera switching, torch control, and automatic phone detection.
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

    const { isScanning, facingMode, isTorchOn } = scannerState;
    const isPhoneDevice = isPhone();

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
      <div className={`mbs-container ${className}`} style={containerStyle}>
        {/* Camera Feed */}
        <div className="mbs-video-container" role="region" aria-label="Barcode scanner viewfinder">
          <IconCameraPlaceholder className="mbs-placeholder-icon" />
          <video
            title="Barcode Scanner"
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="mbs-video"
          />
        </div>

        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} hidden />

        {/* Scanning Animation Line */}
        <ScanLine visible={isScanning && showScanLine} />

        {/* Camera Controls */}
        <ScannerControls
          isScanning={isScanning}
          isTorchOn={isTorchOn}
          shouldShowRotateButton={showCameraSwitch && isScanning && isPhoneDevice}
          shouldShowTorchButton={
            showTorchButton && isScanning && isPhoneDevice && facingMode === "environment"
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
