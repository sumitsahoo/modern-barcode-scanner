/**
 * Modern Barcode Scanner
 *
 * A high-performance barcode scanner React component with optimized detection,
 * camera switching, torch control, and automatic phone detection.
 *
 * @packageDocumentation
 */

// Styles - auto-imported when using the library
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
export { isPhone, getBestRearCamera, getMediaConstraints, stopAllTracks } from "./utils/barcodeHelpers";

// Sub-components (for custom implementations)
export {
	ScanLine,
	ScannerControls,
	IconRotateCamera,
	IconTorchOn,
	IconTorchOff,
	IconCameraPlaceholder,
} from "./components";
