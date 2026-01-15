import { useRef, useState } from "react";
import { BarcodeScanner, type BarcodeScannerRef, type ScanResult, type ScannerState } from "../src";

function App() {
	const scannerRef = useRef<BarcodeScannerRef>(null);
	const [result, setResult] = useState<ScanResult | null>(null);
	const [state, setState] = useState<ScannerState | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleScan = (scanResult: ScanResult) => {
		setResult(scanResult);
		setError(null);
	};

	const handleError = (err: Error) => {
		setError(err.message);
	};

	const handleStateChange = (newState: ScannerState) => {
		setState(newState);
	};

	const startScanning = () => {
		setResult(null);
		setError(null);
		scannerRef.current?.start();
	};

	const stopScanning = () => {
		scannerRef.current?.stop();
	};

	return (
		<div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
			{/* Controls */}
			<div
				style={{
					padding: "1rem",
					background: "#1a1a1a",
					color: "white",
					display: "flex",
					gap: "1rem",
					alignItems: "center",
					flexWrap: "wrap",
				}}
			>
				<h1 style={{ margin: 0, fontSize: "1.25rem" }}>Modern Barcode Scanner</h1>
				<button
					onClick={startScanning}
					disabled={state?.isScanning}
					style={{
						padding: "0.5rem 1rem",
						background: state?.isScanning ? "#666" : "#4db8a8",
						color: "white",
						border: "none",
						borderRadius: "0.5rem",
						cursor: state?.isScanning ? "not-allowed" : "pointer",
					}}
				>
					Start Scanning
				</button>
				<button
					onClick={stopScanning}
					disabled={!state?.isScanning}
					style={{
						padding: "0.5rem 1rem",
						background: !state?.isScanning ? "#666" : "#ef4444",
						color: "white",
						border: "none",
						borderRadius: "0.5rem",
						cursor: !state?.isScanning ? "not-allowed" : "pointer",
					}}
				>
					Stop Scanning
				</button>

				{/* Status */}
				<span style={{ marginLeft: "auto", opacity: 0.7 }}>
					{state?.isScanning ? "🔴 Scanning..." : "⚪ Idle"}
					{state?.isTorchOn && " | 🔦 Torch On"}
				</span>
			</div>

			{/* Result Display */}
			{result && (
				<div
					style={{
						padding: "1rem",
						background: "#059669",
						color: "white",
					}}
				>
					<strong>Detected ({result.typeName}):</strong> {result.scanData}
				</div>
			)}

			{/* Error Display */}
			{error && (
				<div
					style={{
						padding: "1rem",
						background: "#dc2626",
						color: "white",
					}}
				>
					<strong>Error:</strong> {error}
				</div>
			)}

			{/* Scanner */}
			<div style={{ flex: 1, position: "relative" }}>
				<BarcodeScanner
					ref={scannerRef}
					onScan={handleScan}
					onError={handleError}
					onStateChange={handleStateChange}
					enableVibration={true}
				/>
			</div>
		</div>
	);
}

export default App;
