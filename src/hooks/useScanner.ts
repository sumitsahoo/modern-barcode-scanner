import { useCallback, useEffect, useRef, useState } from "react";
import type { FacingMode } from "../constants/camera";
import {
	CANVAS_CONTEXT_OPTIONS,
	MAX_SCAN_DIMENSION,
	SCAN_INTERVAL_MS,
	VIBRATION_DURATION_MS,
} from "../constants/scanner";
import type { ScanResult, ScannerConfig, ScannerState } from "../types";
import { getMediaConstraints, stopAllTracks } from "../utils/barcodeHelpers";
import type { WorkerResponse } from "../workers/scanner.worker";

interface UseScannerOptions extends ScannerConfig {
	onScan: (result: ScanResult) => void;
	onError?: (error: Error) => void;
	onStateChange?: (state: ScannerState) => void;
}

/**
 * Custom hook for barcode scanning logic and camera state management
 * Handles video stream, barcode detection, and camera controls
 */
export const useScanner = ({
	onScan,
	onError,
	onStateChange,
	scanInterval = SCAN_INTERVAL_MS,
	enableVibration = true,
	vibrationDuration = VIBRATION_DURATION_MS,
	enableSound = false,
	beepSoundUrl,
	initialFacingMode = "environment",
}: UseScannerOptions) => {
	const [scannerState, setScannerState] = useState<ScannerState>({
		isScanning: false,
		facingMode: initialFacingMode,
		isTorchOn: false,
	});

	// Refs for DOM elements
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const contextRef = useRef<CanvasRenderingContext2D | null>(null);

	// Refs for scanning control
	const animationFrameId = useRef<number | null>(null);
	const workerRef = useRef<Worker | null>(null);
	const lastScanTimeRef = useRef<number>(0);

	// Session-based tracking
	const scanSessionRef = useRef<number>(0);
	const isWorkerBusy = useRef<boolean>(false);

	// Notify state changes
	useEffect(() => {
		onStateChange?.(scannerState);
	}, [scannerState, onStateChange]);

	/**
	 * Stop scanning and cleanup resources
	 */
	const handleStopScan = useCallback(() => {
		scanSessionRef.current += 1;

		if (animationFrameId.current) {
			cancelAnimationFrame(animationFrameId.current);
			animationFrameId.current = null;
		}

		if (videoRef.current) {
			videoRef.current.pause();
			stopAllTracks(videoRef.current.srcObject as MediaStream);
			videoRef.current.srcObject = null;
		}

		setScannerState((prev) => ({ ...prev, isScanning: false, isTorchOn: false }));
	}, []);

	const handleDetectionRef = useRef<((data: ScanResult) => void) | null>(null);
	handleDetectionRef.current = (data: ScanResult) => {
		handleStopScan();

		if (enableVibration) {
			window?.navigator?.vibrate?.(vibrationDuration);
		}

		if (enableSound && audioRef.current) {
			audioRef.current.play().catch(() => {});
		}

		onScan(data);
	};

	// Initialize Web Worker - only once on mount
	useEffect(() => {
		workerRef.current = new Worker(new URL("../workers/scanner.worker.ts", import.meta.url), { type: "module" });

		workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const { found, data, sessionId } = e.data;
			isWorkerBusy.current = false;

			// Only process if this result belongs to current session
			if (sessionId === scanSessionRef.current && found && data) {
				handleDetectionRef.current?.(data);
			}
		};

		workerRef.current.onerror = (error) => {
			isWorkerBusy.current = false;
			onError?.(new Error(error.message));
		};

		return () => {
			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
			}
		};
	}, [onError]);

	/**
	 * Initialize and start the barcode scanning process
	 */
	const handleScan = useCallback(async () => {
		scanSessionRef.current += 1;
		const currentSession = scanSessionRef.current;
		isWorkerBusy.current = false;
		lastScanTimeRef.current = 0;

		setScannerState((prev) => ({ ...prev, isScanning: true }));

		try {
			const mediaConstraints = await getMediaConstraints(scannerState.facingMode);
			const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

			// Check if session is still valid
			if (currentSession !== scanSessionRef.current) {
				stopAllTracks(stream);
				return;
			}

			if (!videoRef.current) {
				stopAllTracks(stream);
				return;
			}

			videoRef.current.srcObject = stream;
			await videoRef.current.play();

			// Double-check session is still valid after video starts
			if (currentSession !== scanSessionRef.current) {
				handleStopScan();
				return;
			}

			const canvas = canvasRef.current;
			if (!canvas) return;

			// Reuse context for better performance
			if (!contextRef.current) {
				contextRef.current = canvas.getContext("2d", CANVAS_CONTEXT_OPTIONS);
			}
			const context = contextRef.current;

			const width = videoRef.current.videoWidth;
			const height = videoRef.current.videoHeight;

			// Downscale for performance
			const scale = Math.min(MAX_SCAN_DIMENSION / width, MAX_SCAN_DIMENSION / height, 1);
			const scanWidth = Math.floor(width * scale);
			const scanHeight = Math.floor(height * scale);

			canvas.width = scanWidth;
			canvas.height = scanHeight;

			/**
			 * Animation loop for continuous barcode scanning
			 */
			const scanTick = () => {
				// Stop if session changed
				if (currentSession !== scanSessionRef.current) {
					return;
				}

				const now = Date.now();
				const timeSinceLastScan = now - lastScanTimeRef.current;

				// Throttle scan rate
				if (timeSinceLastScan < scanInterval || isWorkerBusy.current) {
					animationFrameId.current = requestAnimationFrame(scanTick);
					return;
				}

				lastScanTimeRef.current = now;

				try {
					if (!videoRef.current || !context || !workerRef.current) {
						animationFrameId.current = requestAnimationFrame(scanTick);
						return;
					}

					// Draw video frame to canvas with scaling
					context.drawImage(videoRef.current, 0, 0, scanWidth, scanHeight);
					const imageData = context.getImageData(0, 0, scanWidth, scanHeight);

					// Mark worker as busy before sending
					isWorkerBusy.current = true;

					// Send to worker with session ID for tracking
					workerRef.current.postMessage({ imageData, type: "scan", sessionId: currentSession }, [
						imageData.data.buffer,
					]);

					animationFrameId.current = requestAnimationFrame(scanTick);
				} catch {
					isWorkerBusy.current = false;
					animationFrameId.current = requestAnimationFrame(scanTick);
				}
			};

			animationFrameId.current = requestAnimationFrame(scanTick);
		} catch (error) {
			handleStopScan();
			onError?.(error instanceof Error ? error : new Error("Failed to start scanner"));
		}
	}, [scannerState.facingMode, handleStopScan, scanInterval, onError]);

	/**
	 * Switch between front and back cameras
	 */
	const handleSwitchCamera = useCallback(async () => {
		if (!videoRef.current || !scannerState.isScanning) return;

		const newFacingMode: FacingMode = scannerState.facingMode === "user" ? "environment" : "user";
		const currentSession = scanSessionRef.current;

		try {
			if (videoRef.current.srcObject) {
				stopAllTracks(videoRef.current.srcObject as MediaStream);
			}

			const mediaConstraints = await getMediaConstraints(newFacingMode);

			// Check if session is still valid after async operation
			if (currentSession !== scanSessionRef.current) {
				return;
			}

			const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

			// Check again after getting stream
			if (currentSession !== scanSessionRef.current) {
				stopAllTracks(stream);
				return;
			}

			if (!videoRef.current) {
				stopAllTracks(stream);
				return;
			}

			videoRef.current.srcObject = stream;
			await videoRef.current.play();

			// Final check after video starts
			if (currentSession !== scanSessionRef.current) {
				handleStopScan();
				return;
			}

			const canvas = canvasRef.current;
			if (canvas) {
				canvas.width = videoRef.current.videoWidth;
				canvas.height = videoRef.current.videoHeight;
			}

			setScannerState((prev) => ({
				...prev,
				facingMode: newFacingMode,
				isTorchOn: false,
			}));
		} catch (error) {
			handleStopScan();
			onError?.(error instanceof Error ? error : new Error("Failed to switch camera"));
		}
	}, [scannerState.facingMode, scannerState.isScanning, handleStopScan, onError]);

	/**
	 * Toggle the torch/flash
	 */
	const handleToggleTorch = useCallback(async () => {
		const track = (videoRef.current?.srcObject as MediaStream)?.getVideoTracks()?.[0];
		const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
		if (!capabilities?.torch) return;

		const newTorchState = !scannerState.isTorchOn;
		try {
			// Using type assertion for torch constraint which is not in standard TypeScript definitions
			// but is supported by Chrome and other browsers
			await track.applyConstraints({
				advanced: [{ torch: newTorchState } as unknown as MediaTrackConstraintSet],
			});
			setScannerState((prev) => ({ ...prev, isTorchOn: newTorchState }));
		} catch {
			// Torch toggle failed silently
		}
	}, [scannerState.isTorchOn]);

	// Cleanup on unmount
	const handleStopScanRef = useRef(handleStopScan);
	handleStopScanRef.current = handleStopScan;

	useEffect(() => () => handleStopScanRef.current(), []);

	return {
		scannerState,
		videoRef,
		canvasRef,
		audioRef,
		beepSoundUrl,
		handleScan,
		handleStopScan,
		handleSwitchCamera,
		handleToggleTorch,
	};
};
