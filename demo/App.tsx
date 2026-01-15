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
						<svg viewBox="0 0 24 24" fill="none" className="scan-button-icon">
							<title>Camera Icon</title>
							<path
								d="M12 16C13.6569 16 15 14.6569 15 13C15 11.3431 13.6569 10 12 10C10.3431 10 9 11.3431 9 13C9 14.6569 10.3431 16 12 16Z"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="M3 16.8V9.2C3 8.0799 3 7.51984 3.21799 7.09202C3.40973 6.71569 3.71569 6.40973 4.09202 6.21799C4.51984 6 5.0799 6 6.2 6H7.25464C7.37758 6 7.43905 6 7.49576 5.9935C7.79166 5.95961 8.05705 5.79559 8.21969 5.54609C8.25086 5.49827 8.27836 5.44328 8.33333 5.33333C8.44329 5.11342 8.49827 5.00346 8.56062 4.90782C8.8859 4.40882 9.41668 4.08078 10.0085 4.01299C10.1219 4 10.2448 4 10.4907 4H13.5093C13.7552 4 13.8781 4 13.9915 4.01299C14.5833 4.08078 15.1141 4.40882 15.4394 4.90782C15.5017 5.00345 15.5567 5.11345 15.6667 5.33333C15.7216 5.44329 15.7491 5.49827 15.7803 5.54609C15.943 5.79559 16.2083 5.95961 16.5042 5.9935C16.561 6 16.6224 6 16.7454 6H17.8C18.9201 6 19.4802 6 19.908 6.21799C20.2843 6.40973 20.5903 6.71569 20.782 7.09202C21 7.51984 21 8.0799 21 9.2V16.8C21 17.9201 21 18.4802 20.782 18.908C20.5903 19.2843 20.2843 19.5903 19.908 19.782C19.4802 20 18.9201 20 17.8 20H6.2C5.0799 20 4.51984 20 4.09202 19.782C3.71569 19.5903 3.40973 19.2843 3.21799 18.908C3 18.4802 3 17.9201 3 16.8Z"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
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
