/**
 * Type definitions for Modern Barcode Scanner
 */

import type { FacingMode } from "./constants/camera";

/**
 * Barcode scan result
 */
export interface ScanResult {
	/** The type of barcode detected (e.g., 'QRCODE', 'EAN13', 'CODE128') */
	typeName: string;
	/** The decoded data from the barcode */
	scanData: string;
}

/**
 * Scanner state
 */
export interface ScannerState {
	/** Whether the scanner is currently active */
	isScanning: boolean;
	/** Current camera facing mode */
	facingMode: FacingMode;
	/** Whether the torch/flash is on */
	isTorchOn: boolean;
}

/**
 * Scanner configuration options
 */
export interface ScannerConfig {
	/**
	 * Time interval between scan attempts in milliseconds
	 * Lower = faster detection but more CPU usage
	 * @default 100
	 */
	scanInterval?: number;
	/**
	 * Enable haptic feedback on successful scan
	 * @default true
	 */
	enableVibration?: boolean;
	/**
	 * Duration of haptic feedback vibration in milliseconds
	 * @default 200
	 */
	vibrationDuration?: number;
	/**
	 * Enable sound feedback on successful scan
	 * @default false
	 */
	enableSound?: boolean;
	/**
	 * Custom beep sound URL
	 */
	beepSoundUrl?: string;
	/**
	 * Initial camera facing mode
	 * @default 'environment'
	 */
	initialFacingMode?: FacingMode;
	/**
	 * Custom CSS class for the scanner container
	 */
	className?: string;
	/**
	 * Show the scanning animation line
	 * @default true
	 */
	showScanLine?: boolean;
	/**
	 * Show camera switch button (only on phones)
	 * @default true
	 */
	showCameraSwitch?: boolean;
	/**
	 * Show torch/flash button (only on phones with back camera)
	 * @default true
	 */
	showTorchButton?: boolean;
	/**
	 * Custom styles for the scanner container
	 */
	style?: React.CSSProperties;
}

/**
 * Props for the BarcodeScanner component
 */
export interface BarcodeScannerProps extends ScannerConfig {
	/**
	 * Callback fired when a barcode is successfully detected
	 * The scanner will automatically stop after detection
	 */
	onScan: (result: ScanResult) => void;
	/**
	 * Callback fired when an error occurs
	 */
	onError?: (error: Error) => void;
	/**
	 * Callback fired when scanner state changes
	 */
	onStateChange?: (state: ScannerState) => void;
}

/**
 * Ref handle for imperative scanner control
 */
export interface BarcodeScannerRef {
	/** Start the scanner */
	start: () => Promise<void>;
	/** Stop the scanner */
	stop: () => void;
	/** Switch between front and back cameras */
	switchCamera: () => Promise<void>;
	/** Toggle the torch/flash */
	toggleTorch: () => Promise<void>;
	/** Get current scanner state */
	getState: () => ScannerState;
}
