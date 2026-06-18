/**
 * Modern Barcode Scanner
 *
 * A high-performance barcode scanner React component with optimized detection,
 * camera switching, torch control, and automatic phone detection.
 *
 * @packageDocumentation
 */

// Styles.
//
// This import tells the build to extract the component CSS into a standalone
// stylesheet (`modern-barcode-scanner/styles.css`). Because the CSS is emitted
// as a separate file (not injected at runtime), consumers must import it once
// in their app:
//
//   import "modern-barcode-scanner/styles.css";
//
// This is intentional — a separate stylesheet is tree-shakeable and lets
// consumers override the design tokens without fighting injected styles.
import "./styles.css";

// Main component
export { BarcodeScanner } from "./components";

// Hooks
export { useScanner } from "./hooks";

// Types
export type {
  BarcodeScannerProps,
  BarcodeScannerRef,
  ScannerConfig,
  ScannerState,
  ScanResult,
} from "./types";

// Constants
export { FACING_MODE, type FacingMode } from "./constants/camera";
export { SCAN_INTERVAL_MS, VIBRATION_DURATION_MS } from "./constants/scanner";

// Utilities (for advanced usage)
export {
  isPhone,
  getBestRearCamera,
  getMediaConstraints,
  stopAllTracks,
} from "./utils/barcodeHelpers";

// Sub-components (for custom implementations)
export {
  ScanLine,
  ScannerControls,
  IconRotateCamera,
  IconTorchOn,
  IconTorchOff,
  IconCameraPlaceholder,
} from "./components";
