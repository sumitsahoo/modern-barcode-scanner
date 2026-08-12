import { useCallback, useEffect, useRef, useState } from "react";
import type { FacingMode } from "../constants/camera";
import {
  CANVAS_CONTEXT_OPTIONS,
  MAX_SCAN_DIMENSION,
  SCAN_INTERVAL_MS,
  VIBRATION_DURATION_MS,
} from "../constants/scanner";
import type { ScannerConfig, ScannerState, ScanResult } from "../types";
import { getMediaConstraints, playScanSound, stopAllTracks } from "../utils";
// The worker is inlined into the bundle (`?worker&inline`) so consumers of the
// published library never have to resolve or copy a separate worker file —
// it ships as a self-contained Blob inside the main JS. See GitHub issue re:
// "service worker not loading / relative path in dist".
import ScannerWorker from "../workers/scanner.worker.ts?worker&inline";
import type { WorkerResponse } from "../workers/scanner.worker";

interface UseScannerOptions extends ScannerConfig {
  onScan: (result: ScanResult) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: ScannerState) => void;
}

// Module-level Web Worker caching for React 18 Strict Mode compatibility
let sharedWorker: Worker | null = null;
let workerRefCount = 0;
let terminateTimeoutId: ReturnType<typeof setTimeout> | null = null;
let nextScannerId = 1;

const getSharedWorker = (): Worker => {
  if (terminateTimeoutId) {
    clearTimeout(terminateTimeoutId);
    terminateTimeoutId = null;
  }
  if (!sharedWorker) {
    sharedWorker = new ScannerWorker();
  }
  workerRefCount++;
  return sharedWorker;
};

const releaseSharedWorker = (): void => {
  workerRefCount--;
  if (workerRefCount <= 0) {
    // Delay termination to handle React 18 Strict Mode double-invocations
    terminateTimeoutId = setTimeout(() => {
      if (workerRefCount <= 0 && sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
      }
    }, 100);
  }
};

const getTorchSupport = (stream: MediaStream): boolean => {
  const track = stream.getVideoTracks()[0];

  try {
    const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    return capabilities?.torch === true;
  } catch {
    // Some browsers expose getCapabilities but throw for camera tracks.
    return false;
  }
};

const hasMultipleCameras = async (): Promise<boolean> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices?.();
    return (devices?.filter((device) => device.kind === "videoinput").length ?? 0) > 1;
  } catch {
    // Camera switching is optional and stays hidden when enumeration fails.
    return false;
  }
};

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
  initialFacingMode = "environment",
}: UseScannerOptions) => {
  const [scannerState, setScannerState] = useState<ScannerState>({
    isStarting: false,
    isScanning: false,
    facingMode: initialFacingMode,
    isTorchOn: false,
    isTorchSupported: false,
    canSwitchCamera: false,
  });

  // Refs for DOM elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Refs for scanning control
  const animationFrameId = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scanAttemptRef = useRef<number>(0);
  const scannerIdRef = useRef<number | null>(null);

  if (scannerIdRef.current === null) {
    scannerIdRef.current = nextScannerId++;
  }

  // Session-based tracking
  const scanSessionRef = useRef<number>(0);
  const cameraRequestRef = useRef<number>(0);
  const isWorkerBusy = useRef<boolean>(false);
  const onErrorRef = useRef(onError);
  const onStateChangeRef = useRef(onStateChange);
  onErrorRef.current = onError;
  onStateChangeRef.current = onStateChange;

  // Notify state changes
  useEffect(() => {
    onStateChangeRef.current?.(scannerState);
  }, [scannerState]);

  const refreshCameraAvailability = useCallback(async (sessionId: number) => {
    const canSwitchCamera = await hasMultipleCameras();
    if (sessionId !== scanSessionRef.current) return;
    setScannerState((prev) => ({ ...prev, canSwitchCamera }));
  }, []);

  /** Release one stream without disturbing a newer replacement stream. */
  const releaseStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;

    if (activeStreamRef.current === stream) {
      activeStreamRef.current = null;
    }

    if (videoRef.current?.srcObject === stream) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    stopAllTracks(stream);
  }, []);

  /** Release every stream currently owned or attached by this scanner. */
  const releaseCamera = useCallback(() => {
    const ownedStream = activeStreamRef.current;
    const attachedStream = (videoRef.current?.srcObject as MediaStream | null) ?? null;
    activeStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    for (const stream of new Set([ownedStream, attachedStream])) {
      stopAllTracks(stream);
    }
  }, []);

  /**
   * Stop scanning and cleanup resources
   */
  const handleStopScan = useCallback(() => {
    scanSessionRef.current += 1;
    cameraRequestRef.current += 1;

    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    releaseCamera();

    setScannerState((prev) => ({
      ...prev,
      isStarting: false,
      isScanning: false,
      isTorchOn: false,
      isTorchSupported: false,
      canSwitchCamera: false,
    }));
  }, [releaseCamera]);

  const handleDetectionRef = useRef<((data: ScanResult) => void) | null>(null);
  handleDetectionRef.current = (data: ScanResult) => {
    handleStopScan();

    if (enableVibration) {
      window?.navigator?.vibrate?.(vibrationDuration);
    }

    if (enableSound) {
      playScanSound();
    }

    onScan(data);
  };

  // Initialize Web Worker - uses shared worker with delayed cleanup
  useEffect(() => {
    workerRef.current = getSharedWorker();

    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      const { found, data, error, scannerId, sessionId } = e.data;
      if (scannerId !== scannerIdRef.current) return;

      // Only process if this result belongs to this scanner's current session.
      if (sessionId !== scanSessionRef.current) return;

      isWorkerBusy.current = false;

      if (error) {
        handleStopScan();
        onErrorRef.current?.(new Error(error));
      } else if (found && data) {
        handleDetectionRef.current?.(data);
      }
    };

    const handleError = (error: ErrorEvent) => {
      isWorkerBusy.current = false;
      handleStopScan();
      onErrorRef.current?.(new Error(error.message));
    };

    workerRef.current.addEventListener("message", handleMessage);
    workerRef.current.addEventListener("error", handleError);

    return () => {
      if (workerRef.current) {
        workerRef.current.removeEventListener("message", handleMessage);
        workerRef.current.removeEventListener("error", handleError);
        workerRef.current = null;
      }
      releaseSharedWorker();
    };
  }, [handleStopScan]);

  /**
   * Initialize and start the barcode scanning process
   */
  const handleScan = useCallback(async () => {
    // Calling start repeatedly must replace, rather than leak, an active stream.
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    releaseCamera();

    scanSessionRef.current += 1;
    const currentSession = scanSessionRef.current;
    const currentCameraRequest = ++cameraRequestRef.current;
    isWorkerBusy.current = false;
    lastScanTimeRef.current = 0;
    scanAttemptRef.current = 0;

    setScannerState((prev) => ({
      ...prev,
      isStarting: true,
      isScanning: false,
      isTorchOn: false,
      isTorchSupported: false,
      canSwitchCamera: false,
    }));

    let stream: MediaStream | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported in this browser");
      }

      const mediaConstraints = await getMediaConstraints(scannerState.facingMode);
      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      // Check if session is still valid
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }

      if (!videoRef.current) {
        releaseStream(stream);
        throw new Error("Scanner video element is unavailable");
      }

      activeStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Double-check session is still valid after video starts
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Scanner canvas is unavailable");
      }

      // Reuse context for better performance
      if (!contextRef.current) {
        contextRef.current = canvas.getContext("2d", CANVAS_CONTEXT_OPTIONS);
      }
      const context = contextRef.current;
      if (!context) {
        throw new Error("Canvas image processing is not supported in this browser");
      }

      const isTorchSupported = getTorchSupport(stream);
      setScannerState((prev) => ({
        ...prev,
        isStarting: false,
        isScanning: true,
        isTorchSupported,
      }));
      void refreshCameraAvailability(currentSession);

      const videoSettings = stream.getVideoTracks()[0]?.getSettings();
      const width = videoRef.current.videoWidth || videoSettings?.width || MAX_SCAN_DIMENSION;
      const height = videoRef.current.videoHeight || videoSettings?.height || MAX_SCAN_DIMENSION;

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
          workerRef.current.postMessage(
            {
              imageData,
              type: "scan",
              scannerId: scannerIdRef.current,
              sessionId: currentSession,
              attempt: scanAttemptRef.current++,
            },
            [imageData.data.buffer],
          );

          animationFrameId.current = requestAnimationFrame(scanTick);
        } catch {
          isWorkerBusy.current = false;
          animationFrameId.current = requestAnimationFrame(scanTick);
        }
      };

      animationFrameId.current = requestAnimationFrame(scanTick);
    } catch (error) {
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }
      handleStopScan();
      onErrorRef.current?.(error instanceof Error ? error : new Error("Failed to start scanner"));
    }
  }, [
    scannerState.facingMode,
    handleStopScan,
    refreshCameraAvailability,
    releaseCamera,
    releaseStream,
    scanInterval,
  ]);

  /**
   * Switch between front and back cameras
   */
  const handleSwitchCamera = useCallback(async () => {
    if (!videoRef.current || !scannerState.isScanning) return;

    const newFacingMode: FacingMode = scannerState.facingMode === "user" ? "environment" : "user";
    const currentSession = scanSessionRef.current;
    const currentCameraRequest = ++cameraRequestRef.current;

    let stream: MediaStream | null = null;

    try {
      releaseCamera();

      const mediaConstraints = await getMediaConstraints(newFacingMode);

      // Check if session is still valid after async operation
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      // Check again after getting stream
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }

      if (!videoRef.current) {
        releaseStream(stream);
        throw new Error("Scanner video element is unavailable");
      }

      activeStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Final check after video starts
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }

      const isTorchSupported = getTorchSupport(stream);
      setScannerState((prev) => ({
        ...prev,
        facingMode: newFacingMode,
        isTorchOn: false,
        isTorchSupported,
      }));
      void refreshCameraAvailability(currentSession);
    } catch (error) {
      if (
        currentSession !== scanSessionRef.current ||
        currentCameraRequest !== cameraRequestRef.current
      ) {
        releaseStream(stream);
        return;
      }
      handleStopScan();
      onErrorRef.current?.(error instanceof Error ? error : new Error("Failed to switch camera"));
    }
  }, [
    scannerState.facingMode,
    scannerState.isScanning,
    handleStopScan,
    refreshCameraAvailability,
    releaseCamera,
    releaseStream,
  ]);

  /**
   * Toggle the torch/flash
   */
  const handleToggleTorch = useCallback(async () => {
    try {
      const track = (videoRef.current?.srcObject as MediaStream)?.getVideoTracks()?.[0];
      const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (!track || !capabilities?.torch) return;

      const newTorchState = !scannerState.isTorchOn;
      // Using type assertion for torch constraint which is not in standard TypeScript definitions
      // but is supported by Chrome and other browsers
      await track.applyConstraints({
        advanced: [{ torch: newTorchState } as unknown as MediaTrackConstraintSet],
      });
      setScannerState((prev) => ({ ...prev, isTorchOn: newTorchState }));
    } catch (error) {
      onErrorRef.current?.(error instanceof Error ? error : new Error("Failed to toggle torch"));
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
    handleScan,
    handleStopScan,
    handleSwitchCamera,
    handleToggleTorch,
  };
};
