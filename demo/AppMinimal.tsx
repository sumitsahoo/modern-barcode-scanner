import { useCallback, useRef, useState } from "react";
import { BarcodeScanner, type BarcodeScannerRef, type ScannerState, type ScanResult } from "../src";

/**
 * Minimal Demo - Bare bones scanner for testing
 */
function AppMinimal() {
	const scannerRef = useRef<BarcodeScannerRef>(null);
	const [result, setResult] = useState<string | null>(null);
	const [isScanning, setIsScanning] = useState(false);
	const PRIMARY_COLOR = "#4db8a8";

	const handleScan = useCallback((scanResult: ScanResult) => {
		setResult(`${scanResult.typeName}: ${scanResult.scanData}`);
		console.log("Scanned:", scanResult);
	}, []);

	const handleError = useCallback((err: Error) => {
		console.error("Scanner error:", err.message);
	}, []);

	const handleStateChange = useCallback((state: ScannerState) => {
		setIsScanning(state.isScanning);
	}, []);

	const toggleScanner = useCallback(() => {
		if (isScanning) {
			scannerRef.current?.stop();
		} else {
			setResult(null);
			scannerRef.current?.start();
		}
	}, [isScanning]);

	return (
		<div style={{ width: "100vw", height: "100dvh", position: "relative" }}>
			<BarcodeScanner
				ref={scannerRef}
				onScan={handleScan}
				onError={handleError}
				onStateChange={handleStateChange}
				themeColor={PRIMARY_COLOR}
			/>

			{/* Simple controls */}
			<div
				style={{
					position: "absolute",
					bottom: 20,
					left: 0,
					right: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 10,
					zIndex: 100,
				}}
			>
				<button
					type="button"
					onClick={toggleScanner}
					style={{
						padding: "12px 24px",
						fontSize: 16,
						borderRadius: 8,
						border: "none",
						background: isScanning ? "#ef4444" : PRIMARY_COLOR,
						color: "white",
						cursor: "pointer",
					}}
				>
					{isScanning ? "Stop" : "Start"}
				</button>

				{result && (
					<div
						style={{
							padding: "8px 16px",
							background: "rgba(0,0,0,0.8)",
							color: "white",
							borderRadius: 8,
							maxWidth: "90%",
							wordBreak: "break-all",
						}}
					>
						{result}
					</div>
				)}
			</div>
		</div>
	);
}

export default AppMinimal;
