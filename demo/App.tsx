import { useRef, useState, useCallback } from "react";
import { BarcodeScanner, type BarcodeScannerRef, type ScanResult, type ScannerState } from "../src";

/**
 * Demo App for Modern Barcode Scanner Library
 *
 * Simple, full-screen scanner demo following the aesthetics of the original barcode-scanner repo.
 * This showcases how easy it is to integrate the library.
 */
function App() {
	const scannerRef = useRef<BarcodeScannerRef>(null);
	const [result, setResult] = useState<ScanResult | null>(null);
	const [state, setState] = useState<ScannerState | null>(null);
	const [copied, setCopied] = useState(false);

	const handleScan = useCallback((scanResult: ScanResult) => {
		setResult(scanResult);
	}, []);

	const handleError = useCallback((err: Error) => {
		console.error("Scanner error:", err.message);
	}, []);

	const handleStateChange = useCallback((newState: ScannerState) => {
		setState(newState);
	}, []);

	const startScanning = useCallback(() => {
		setResult(null);
		setCopied(false);
		scannerRef.current?.start();
	}, []);

	const stopScanning = useCallback(() => {
		scannerRef.current?.stop();
	}, []);

	const copyToClipboard = useCallback(async () => {
		if (result?.scanData) {
			await navigator.clipboard.writeText(result.scanData);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [result?.scanData]);

	const dismissResult = useCallback(() => {
		setResult(null);
		setCopied(false);
	}, []);

	return (
		<div className="app">
			{/* Scanner - takes full screen */}
			<BarcodeScanner
				ref={scannerRef}
				onScan={handleScan}
				onError={handleError}
				onStateChange={handleStateChange}
				enableVibration={true}
			/>

			{/* Floating Start Button - shown when not scanning */}
			{!state?.isScanning && !result && (
				<div className="floating-controls">
					<button
						type="button"
						className="scan-button scan-button-start"
						onClick={startScanning}
						aria-label="Start scanning"
					>
						{/* Camera Icon (open) - to start scanning */}
						<svg viewBox="0 0 24 24" fill="none" className="scan-button-icon">
							<title>Camera Icon</title>
							<path
								d="M2 8C2 7.44772 2.44772 7 3 7H4.5C4.77614 7 5.05229 6.89464 5.27639 6.72361L6.38197 6.05279C6.76074 5.79436 7.20891 5.65753 7.66853 5.65753H10.3315C10.7911 5.65753 11.2393 5.79436 11.618 6.05279L12.7236 6.72361C12.9477 6.89464 13.2239 7 13.5 7H15C15.5523 7 16 7.44772 16 8V16C16 16.5523 15.5523 17 15 17H3C2.44772 17 2 16.5523 2 16V8Z"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								transform="translate(3, 0)"
							/>
							<circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
						</svg>
					</button>
				</div>
			)}

			{/* Floating Stop Button - shown when scanning */}
			{state?.isScanning && (
				<div className="floating-controls">
					<button
						type="button"
						className="scan-button scan-button-stop"
						onClick={stopScanning}
						aria-label="Stop scanning"
					>
						<svg viewBox="0 0 24 24" fill="none" className="scan-button-icon">
							<title>Stop Camera Icon</title>
							<path
								d="M3 3L6.00007 6.00007M21 21L19.8455 19.8221M9.74194 4.06811C9.83646 4.04279 9.93334 4.02428 10.0319 4.01299C10.1453 4 10.2683 4 10.5141 4H13.5327C13.7786 4 13.9015 4 14.015 4.01299C14.6068 4.08078 15.1375 4.40882 15.4628 4.90782C15.5252 5.00345 15.5802 5.11345 15.6901 5.33333C15.7451 5.44329 15.7726 5.49827 15.8037 5.54609C15.9664 5.79559 16.2318 5.95961 16.5277 5.9935C16.5844 6 16.6459 6 16.7688 6H17.8234C18.9435 6 19.5036 6 19.9314 6.21799C20.3077 6.40973 20.6137 6.71569 20.8055 7.09202C21.0234 7.51984 21.0234 8.0799 21.0234 9.2V15.3496M19.8455 19.8221C19.4278 20 18.8702 20 17.8234 20H6.22344C5.10333 20 4.54328 20 4.11546 19.782C3.73913 19.5903 3.43317 19.2843 3.24142 18.908C3.02344 18.4802 3.02344 17.9201 3.02344 16.8V9.2C3.02344 8.0799 3.02344 7.51984 3.24142 7.09202C3.43317 6.71569 3.73913 6.40973 4.11546 6.21799C4.51385 6.015 5.0269 6.00103 6.00007 6.00007M19.8455 19.8221L14.5619 14.5619M14.5619 14.5619C14.0349 15.4243 13.0847 16 12 16C10.3431 16 9 14.6569 9 13C9 11.9153 9.57566 10.9651 10.4381 10.4381M14.5619 14.5619L10.4381 10.4381M10.4381 10.4381L6.00007 6.00007"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
				</div>
			)}

			{/* Result Dialog - shown after successful scan */}
			{result && (
				<div className="result-dialog-backdrop">
					<div className="result-dialog">
						<div className="result-dialog-icon">
							<svg viewBox="0 0 24 24" fill="none" className="check-icon">
								<title>Success</title>
								<path
									d="M5 13l4 4L19 7"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
						<h2 className="result-dialog-title">{result.typeName || "Barcode Detected"}</h2>
						<div className="result-dialog-data">{result.scanData}</div>
						<div className="result-dialog-actions">
							<button type="button" className="result-btn result-btn-copy" onClick={copyToClipboard}>
								{copied ? "✓ Copied!" : "Copy"}
							</button>
							<button type="button" className="result-btn result-btn-primary" onClick={dismissResult}>
								Close
							</button>
						</div>
						<button type="button" className="result-btn result-btn-scan-again" onClick={startScanning}>
							Scan Again
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
