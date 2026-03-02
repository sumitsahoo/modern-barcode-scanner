import { useRef, useState, useCallback, useEffect } from "react";
import { BarcodeScanner, type BarcodeScannerRef, type ScanResult, type ScannerState } from "../src";

/**
 * Demo App for Modern Barcode Scanner Library
 *
 * Full-featured scanner demo with result dialog.
 * All styles are inline for easy reference.
 */

const styles = {
	app: {
		width: "100vw",
		height: "100dvh",
		position: "relative" as const,
		overflow: "hidden",
	},
	controlsContainer: {
		position: "absolute" as const,
		bottom: "7rem",
		left: "50%",
		transform: "translateX(-50%)",
		zIndex: 40,
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
	},
	controlsContainerScanning: {
		background: "rgba(0, 0, 0, 0.5)",
		border: "1px solid rgba(255, 255, 255, 0.1)",
		borderRadius: "50%",
		padding: "0.5rem",
		backdropFilter: "blur(16px)",
	},
	scanButton: {
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
		borderRadius: "50%",
		border: "none",
		cursor: "pointer",
		transition: "all 0.3s ease",
	},
	scanButtonStart: {
		width: "5rem",
		height: "5rem",
		background: "linear-gradient(135deg, #4db8a8 0%, #3d9d8f 100%)",
		color: "white",
		boxShadow: "0 8px 32px rgba(77, 184, 168, 0.4)",
	},
	scanButtonStop: {
		width: "3.5rem",
		height: "3.5rem",
		background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
		color: "white",
		border: "4px solid rgba(255, 255, 255, 0.3)",
	},
	scanButtonIcon: {
		width: "2rem",
		height: "2rem",
	},
	backdrop: {
		position: "absolute" as const,
		inset: 0,
		zIndex: 100,
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
		background: "rgba(0, 0, 0, 0.6)",
		backdropFilter: "blur(8px)",
	},
	dialog: {
		background: "rgba(255, 255, 255, 0.95)",
		borderRadius: "1.5rem",
		padding: "2rem",
		margin: "1rem",
		maxWidth: "24rem",
		width: "100%",
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center",
		gap: "1rem",
		border: "1px solid rgba(77, 184, 168, 0.2)",
		boxShadow: "0 24px 64px rgba(0, 0, 0, 0.3)",
	},
	dialogIcon: {
		width: "4rem",
		height: "4rem",
		borderRadius: "50%",
		background: "rgba(77, 184, 168, 0.1)",
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
	},
	checkIcon: {
		width: "2rem",
		height: "2rem",
		color: "#4db8a8",
	},
	dialogTitle: {
		margin: 0,
		fontSize: "1.25rem",
		fontWeight: 600,
		color: "#2d5550",
		textAlign: "center" as const,
	},
	dialogData: {
		width: "100%",
		padding: "1rem",
		background: "#f8fafa",
		borderRadius: "0.75rem",
		border: "1px solid rgba(77, 184, 168, 0.2)",
		color: "#2d5550",
		fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",
		fontSize: "0.875rem",
		textAlign: "center" as const,
		wordBreak: "break-all" as const,
	},
	dialogActions: {
		display: "flex",
		gap: "0.75rem",
		width: "100%",
	},
	btn: {
		flex: 1,
		padding: "0.75rem 1rem",
		borderRadius: "0.75rem",
		fontSize: "0.875rem",
		fontWeight: 500,
		cursor: "pointer",
		transition: "all 0.2s ease",
		border: "none",
	},
	btnCopy: {
		background: "#f8fafa",
		color: "#2d5550",
		border: "1px solid rgba(77, 184, 168, 0.2)",
	},
	btnPrimary: {
		background: "linear-gradient(135deg, #4db8a8 0%, #3d9d8f 100%)",
		color: "white",
	},
	btnScanAgain: {
		width: "100%",
		background: "transparent",
		color: "#4db8a8",
		border: "1px solid #4db8a8",
		marginTop: "0.5rem",
	},
};

const getStyles = (themeColor: string) => ({
	...styles,
	scanButtonStart: {
		...styles.scanButtonStart,
		background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}dd 100%)`,
		boxShadow: `0 8px 32px ${themeColor}66`,
	},
	checkIcon: {
		...styles.checkIcon,
		color: themeColor,
	},
	dialogIcon: {
		...styles.dialogIcon,
		background: `${themeColor}1a`, // 10% opacity roughly
	},
	btnPrimary: {
		...styles.btnPrimary,
		background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}dd 100%)`,
	},
	btnScanAgain: {
		...styles.btnScanAgain,
		color: themeColor,
		border: `1px solid ${themeColor}`,
	},
	colorPickerContainer: {
		position: "absolute" as const,
		top: "1rem",
		right: "1rem",
		zIndex: 50,
		background: "rgba(255, 255, 255, 0.9)",
		padding: "0.5rem",
		borderRadius: "0.5rem",
		display: "flex",
		alignItems: "center",
		gap: "0.5rem",
		boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
		backdropFilter: "blur(8px)",
	},
	colorPickerLabel: {
		fontSize: "0.875rem",
		fontWeight: 500,
		color: "#2d5550",
	},
	colorInput: {
		width: "2rem",
		height: "2rem",
		padding: 0,
		border: "none",
		borderRadius: "0.25rem",
		cursor: "pointer",
	}
});

function App() {
	const scannerRef = useRef<BarcodeScannerRef>(null);
	const [result, setResult] = useState<ScanResult | null>(null);
	const [state, setState] = useState<ScannerState | null>(null);
	const [copied, setCopied] = useState(false);
	const [themeColor, setThemeColor] = useState("#4db8a8");

	const dynamicStyles = getStyles(themeColor);

	useEffect(() => {
		const metaThemeColor = document.querySelector('meta[name="theme-color"]');
		if (metaThemeColor) {
			metaThemeColor.setAttribute('content', themeColor);
		}
	}, [themeColor]);

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

	const isScanning = state?.isScanning ?? false;

	return (
		<div style={dynamicStyles.app}>
			{/* Color Picker Control */}
			<div style={dynamicStyles.colorPickerContainer}>
				<label htmlFor="theme-color" style={dynamicStyles.colorPickerLabel}>Theme</label>
				<input
					id="theme-color"
					type="color"
					value={themeColor}
					onChange={(e) => setThemeColor(e.target.value)}
					style={dynamicStyles.colorInput}
					title="Change Theme Color"
				/>
			</div>

			{/* Scanner - takes full screen */}
			<BarcodeScanner
				ref={scannerRef}
				onScan={handleScan}
				onError={handleError}
				onStateChange={handleStateChange}
				enableVibration={true}
				themeColor={themeColor}
			/>

			{/* Controls - positioned at bottom center */}
			{!result && (
				<div
					style={{
						...dynamicStyles.controlsContainer,
						...(isScanning ? dynamicStyles.controlsContainerScanning : {}),
					}}
				>
					<button
						type="button"
						style={{
							...dynamicStyles.scanButton,
							...(isScanning ? dynamicStyles.scanButtonStop : dynamicStyles.scanButtonStart),
						}}
						onClick={isScanning ? stopScanning : startScanning}
						aria-label={isScanning ? "Stop scanning" : "Start scanning"}
					>
						{isScanning ? (
							// Camera Closed Icon (stop)
							<svg viewBox="0 0 24 24" fill="none" style={styles.scanButtonIcon}>
								<title>Stop Camera</title>
								<path
									d="M3 3L6.00007 6.00007M21 21L19.8455 19.8221M9.74194 4.06811C9.83646 4.04279 9.93334 4.02428 10.0319 4.01299C10.1453 4 10.2683 4 10.5141 4H13.5327C13.7786 4 13.9015 4 14.015 4.01299C14.6068 4.08078 15.1375 4.40882 15.4628 4.90782C15.5252 5.00345 15.5802 5.11345 15.6901 5.33333C15.7451 5.44329 15.7726 5.49827 15.8037 5.54609C15.9664 5.79559 16.2318 5.95961 16.5277 5.9935C16.5844 6 16.6459 6 16.7688 6H17.8234C18.9435 6 19.5036 6 19.9314 6.21799C20.3077 6.40973 20.6137 6.71569 20.8055 7.09202C21.0234 7.51984 21.0234 8.0799 21.0234 9.2V15.3496M19.8455 19.8221C19.4278 20 18.8702 20 17.8234 20H6.22344C5.10333 20 4.54328 20 4.11546 19.782C3.73913 19.5903 3.43317 19.2843 3.24142 18.908C3.02344 18.4802 3.02344 17.9201 3.02344 16.8V9.2C3.02344 8.0799 3.02344 7.51984 3.24142 7.09202C3.43317 6.71569 3.73913 6.40973 4.11546 6.21799C4.51385 6.015 5.0269 6.00103 6.00007 6.00007M19.8455 19.8221L14.5619 14.5619M14.5619 14.5619C14.0349 15.4243 13.0847 16 12 16C10.3431 16 9 14.6569 9 13C9 11.9153 9.57566 10.9651 10.4381 10.4381M14.5619 14.5619L10.4381 10.4381M10.4381 10.4381L6.00007 6.00007"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						) : (
							// Camera Open Icon (start)
							<svg viewBox="0 0 24 24" fill="none" style={styles.scanButtonIcon}>
								<title>Start Camera</title>
								<path
									d="M12 16C13.6569 16 15 14.6569 15 13C15 11.3431 13.6569 10 12 10C10.3431 10 9 11.3431 9 13C9 14.6569 10.3431 16 12 16Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
								<path
									d="M3 16.8V9.2C3 8.0799 3 7.51984 3.21799 7.09202C3.40973 6.71569 3.71569 6.40973 4.09202 6.21799C4.51984 6 5.0799 6 6.2 6H7.25464C7.37758 6 7.43905 6 7.49576 5.9935C7.79166 5.95961 8.05705 5.79559 8.21969 5.54609C8.25086 5.49827 8.27836 5.44328 8.33333 5.33333C8.44329 5.11342 8.49827 5.00346 8.56062 4.90782C8.8859 4.40882 9.41668 4.08078 10.0085 4.01299C10.1218 4 10.2448 4 10.4907 4H13.5093C13.7552 4 13.8782 4 13.9915 4.01299C14.5833 4.08078 15.1141 4.40882 15.4394 4.90782C15.5017 5.00345 15.5567 5.11345 15.6667 5.33333C15.7216 5.44329 15.7491 5.49827 15.7803 5.54609C15.9429 5.79559 16.2083 5.95961 16.5042 5.9935C16.5609 6 16.6224 6 16.7454 6H17.8C18.9201 6 19.4802 6 19.908 6.21799C20.2843 6.40973 20.5903 6.71569 20.782 7.09202C21 7.51984 21 8.0799 21 9.2V16.8C21 17.9201 21 18.4802 20.782 18.908C20.5903 19.2843 20.2843 19.5903 19.908 19.782C19.4802 20 18.9201 20 17.8 20H6.2C5.0799 20 4.51984 20 4.09202 19.782C3.71569 19.5903 3.40973 19.2843 3.21799 18.908C3 18.4802 3 17.9201 3 16.8Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						)}
					</button>
				</div>
			)}

			{/* Result Dialog - shown after successful scan */}
			{result && (
				<div style={dynamicStyles.backdrop}>
					<div style={dynamicStyles.dialog}>
						<div style={dynamicStyles.dialogIcon}>
							<svg viewBox="0 0 24 24" fill="none" style={dynamicStyles.checkIcon}>
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
						<h2 style={dynamicStyles.dialogTitle}>{result.typeName || "Barcode Detected"}</h2>
						<div style={dynamicStyles.dialogData}>{result.scanData}</div>
						<div style={dynamicStyles.dialogActions}>
							<button
								type="button"
								style={{ ...dynamicStyles.btn, ...dynamicStyles.btnCopy }}
								onClick={copyToClipboard}
							>
								{copied ? "✓ Copied!" : "Copy"}
							</button>
							<button
								type="button"
								style={{ ...dynamicStyles.btn, ...dynamicStyles.btnPrimary }}
								onClick={dismissResult}
							>
								Close
							</button>
						</div>
						<button
							type="button"
							style={{ ...dynamicStyles.btn, ...dynamicStyles.btnScanAgain }}
							onClick={startScanning}
						>
							Scan Again
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
