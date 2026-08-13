import { useCallback, useEffect, useRef, useState } from "react";
import type { FacingMode } from "../constants/camera";
import {
  CANVAS_CONTEXT_OPTIONS,
  FULL_FRAME_SCAN_INTERVAL,
  MAX_SCAN_DIMENSION,
  SCAN_INTERVAL_MS,
  VIBRATION_DURATION_MS,
} from "../constants/scanner";
import type { ScannerConfig, ScannerState, ScanResult } from "../types";
import { getMediaConstraints, playScanSound, stopAllTracks } from "../utils";
import { getViewfinderSourceRegion } from "../utils/scanRegion";
// The worker is inlined into the bundle (`?worker&inline`) so consumers of the
// published library never have to resolve or copy a separate worker file —
// it ships as a self-contained Blob inside the main JS. See GitHub issue re:
// "service worker not loading / relative path in dist".
import ScannerWorker from "../workers/scanner.worker.ts?worker&inline";
import type { WorkerResponse } from "../workers/scanner.worker";

const MAX_CONSECUTIVE_CAPTURE_FAILURES = 5;
const VIDEO_READINESS_TIMEOUT_MS = 5_000;
const WORKER_RESPONSE_TIMEOUT_MS = 15_000;

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
const workerInvalidationListeners = new Set<(worker: Worker, error: Error) => void>();

const createSharedWorker = (): Worker => {
  if (terminateTimeoutId) {
    clearTimeout(terminateTimeoutId);
    terminateTimeoutId = null;
  }
  sharedWorker ??= new ScannerWorker();
  return sharedWorker;
};

const getSharedWorker = (): Worker => {
  const worker = createSharedWorker();
  workerRefCount++;
  return worker;
};

const replaceInvalidSharedWorker = (worker: Worker, error: Error): void => {
  if (sharedWorker !== worker) return;

  sharedWorker = null;
  worker.terminate();
  for (const listener of workerInvalidationListeners) listener(worker, error);
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
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
    return capabilities?.torch === true;
  } catch {
    // Some browsers expose getCapabilities but throw for camera tracks.
    return false;
  }
};

interface VideoDimensions {
  width: number;
  height: number;
}

const getPositiveDimensions = (width: unknown, height: unknown): VideoDimensions | null =>
  typeof width === "number" &&
  typeof height === "number" &&
  Number.isFinite(width) &&
  Number.isFinite(height) &&
  width > 0 &&
  height > 0
    ? { width, height }
    : null;

const getVideoDimensions = (
  video: HTMLVideoElement,
  stream: MediaStream | null,
): VideoDimensions | null => {
  if (
    typeof video.readyState === "number" &&
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return null;
  }
  const displayedDimensions = getPositiveDimensions(video.videoWidth, video.videoHeight);
  if (displayedDimensions) return displayedDimensions;

  try {
    const settings = stream?.getVideoTracks()[0]?.getSettings?.();
    return getPositiveDimensions(settings?.width, settings?.height);
  } catch {
    return null;
  }
};

const toError = (error: unknown, fallback: string): Error =>
  error instanceof Error
    ? error
    : typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ? new Error(error.message)
      : new Error(fallback);

const isWorkerResponse = (value: unknown): value is WorkerResponse => {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<WorkerResponse>;
  return (
    typeof response.found === "boolean" &&
    Number.isSafeInteger(response.requestId) &&
    (response.requestId as number) >= 0 &&
    Number.isSafeInteger(response.scannerId) &&
    (response.scannerId as number) >= 0 &&
    Number.isSafeInteger(response.sessionId) &&
    (response.sessionId as number) >= 0 &&
    (response.error === undefined || typeof response.error === "string") &&
    (response.data === undefined ||
      (typeof response.data === "object" &&
        response.data !== null &&
        typeof response.data.typeName === "string" &&
        typeof response.data.scanData === "string")) &&
    !(response.found && !response.data) &&
    !(response.found && response.error !== undefined)
  );
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
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Refs for scanning control
  const animationFrameId = useRef<number | null>(null);
  const scheduledVideoRef = useRef<HTMLVideoElement | null>(null);
  const usesVideoFrameCallbackRef = useRef<boolean>(false);
  const workerRef = useRef<Worker | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const scanAttemptRef = useRef<number>(0);
  const captureAttemptRef = useRef<number>(0);
  const captureFailureCountRef = useRef<number>(0);
  const scannerIdRef = useRef<number | null>(null);
  const nextRequestIdRef = useRef<number>(1);
  const pendingRequestIdRef = useRef<number | null>(null);
  const workerResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoReadinessStartedAtRef = useRef<number | null>(null);
  const ensureWorkerRef = useRef<() => Worker | null>(() => null);
  const activeTrackRef = useRef<MediaStreamTrack | null>(null);
  const activeTrackEndedListenerRef = useRef<(() => void) | null>(null);

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
  const normalizedScanInterval =
    Number.isFinite(scanInterval) && scanInterval >= 0 ? scanInterval : SCAN_INTERVAL_MS;

  const clearPendingWorkerRequest = useCallback(() => {
    if (workerResponseTimeoutRef.current !== null) {
      clearTimeout(workerResponseTimeoutRef.current);
      workerResponseTimeoutRef.current = null;
    }
    pendingRequestIdRef.current = null;
    isWorkerBusy.current = false;
  }, []);

  const cancelScheduledFrame = useCallback(() => {
    if (animationFrameId.current === null) return;
    if (usesVideoFrameCallbackRef.current) {
      scheduledVideoRef.current?.cancelVideoFrameCallback?.(animationFrameId.current);
    } else {
      cancelAnimationFrame(animationFrameId.current);
    }
    animationFrameId.current = null;
    scheduledVideoRef.current = null;
    usesVideoFrameCallbackRef.current = false;
  }, []);

  const detachActiveTrackListener = useCallback(() => {
    if (activeTrackRef.current && activeTrackEndedListenerRef.current) {
      activeTrackRef.current.removeEventListener?.("ended", activeTrackEndedListenerRef.current);
    }
    activeTrackRef.current = null;
    activeTrackEndedListenerRef.current = null;
  }, []);

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
  const releaseStream = useCallback(
    (stream: MediaStream | null) => {
      if (!stream) return;

      if (activeStreamRef.current === stream) {
        detachActiveTrackListener();
        activeStreamRef.current = null;
      }

      if (videoRef.current?.srcObject === stream) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      stopAllTracks(stream);
    },
    [detachActiveTrackListener],
  );

  /** Release every stream currently owned or attached by this scanner. */
  const releaseCamera = useCallback(() => {
    const ownedStream = activeStreamRef.current;
    const attachedStream = (videoRef.current?.srcObject as MediaStream | null) ?? null;
    detachActiveTrackListener();
    activeStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    for (const stream of new Set([ownedStream, attachedStream])) {
      stopAllTracks(stream);
    }
  }, [detachActiveTrackListener]);

  /**
   * Stop scanning and cleanup resources
   */
  const handleStopScan = useCallback(() => {
    scanSessionRef.current += 1;
    cameraRequestRef.current += 1;
    clearPendingWorkerRequest();

    cancelScheduledFrame();

    releaseCamera();

    setScannerState((prev) => ({
      ...prev,
      isStarting: false,
      isScanning: false,
      isTorchOn: false,
      isTorchSupported: false,
      canSwitchCamera: false,
    }));
  }, [cancelScheduledFrame, clearPendingWorkerRequest, releaseCamera]);

  const watchActiveStream = useCallback(
    (stream: MediaStream, sessionId: number) => {
      detachActiveTrackListener();
      const track = stream.getVideoTracks()[0];
      if (!track?.addEventListener) return;

      const handleEnded = () => {
        if (activeStreamRef.current !== stream || scanSessionRef.current !== sessionId) return;
        handleStopScan();
        onErrorRef.current?.(new Error("The active camera stream ended unexpectedly"));
      };

      activeTrackRef.current = track;
      activeTrackEndedListenerRef.current = handleEnded;
      track.addEventListener("ended", handleEnded, { once: true });
    },
    [detachActiveTrackListener, handleStopScan],
  );

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
    let attachedWorker: Worker | null = null;
    let disposed = false;
    let hasWorkerLease = false;
    let automaticRecreationAttempted = false;

    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      const sourceWorker = e.currentTarget as Worker | null;
      if (sourceWorker && sourceWorker !== attachedWorker) return;
      if (!isWorkerResponse(e.data)) {
        const failedWorker = sourceWorker ?? attachedWorker;
        if (failedWorker) {
          replaceInvalidSharedWorker(
            failedWorker,
            new Error("The barcode decoder worker returned an unreadable message"),
          );
        }
        return;
      }
      const { found, data, error, requestId, scannerId, sessionId } = e.data;
      if (scannerId !== scannerIdRef.current) return;

      // Only process if this result belongs to this scanner's current session.
      if (sessionId !== scanSessionRef.current) return;
      if (requestId !== pendingRequestIdRef.current) return;

      automaticRecreationAttempted = false;
      clearPendingWorkerRequest();

      if (error) {
        handleStopScan();
        onErrorRef.current?.(new Error(error));
      } else if (found && data) {
        handleDetectionRef.current?.(data);
      }
    };

    const handleError = (event: ErrorEvent) => {
      const sourceWorker = event.currentTarget as Worker | null;
      if (sourceWorker && sourceWorker !== attachedWorker) return;
      const failedWorker = sourceWorker ?? attachedWorker;
      if (!failedWorker) return;
      replaceInvalidSharedWorker(
        failedWorker,
        new Error(event.message || "The barcode decoder worker stopped unexpectedly"),
      );
    };

    const handleMessageError = (event: MessageEvent) => {
      const sourceWorker = event.currentTarget as Worker | null;
      if (sourceWorker && sourceWorker !== attachedWorker) return;
      const failedWorker = sourceWorker ?? attachedWorker;
      if (!failedWorker) return;
      replaceInvalidSharedWorker(
        failedWorker,
        new Error("The barcode decoder worker returned an unreadable message"),
      );
    };

    const detachWorker = () => {
      if (!attachedWorker) return;
      attachedWorker.removeEventListener("message", handleMessage);
      attachedWorker.removeEventListener("error", handleError);
      attachedWorker.removeEventListener("messageerror", handleMessageError);
      if (workerRef.current === attachedWorker) workerRef.current = null;
      attachedWorker = null;
    };

    const connectWorker = (): Worker | null => {
      if (disposed) return null;
      if (attachedWorker) return attachedWorker;

      const worker = hasWorkerLease ? createSharedWorker() : getSharedWorker();
      hasWorkerLease = true;
      attachedWorker = worker;
      workerRef.current = worker;
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      return worker;
    };

    const handleWorkerInvalidation = (failedWorker: Worker, error: Error) => {
      if (attachedWorker !== failedWorker) return;
      detachWorker();
      clearPendingWorkerRequest();
      handleStopScan();
      onErrorRef.current?.(error);

      if (!automaticRecreationAttempted) {
        automaticRecreationAttempted = true;
        try {
          connectWorker();
        } catch {
          // A later explicit start retries construction and reports that error.
        }
      }
    };

    workerInvalidationListeners.add(handleWorkerInvalidation);
    ensureWorkerRef.current = connectWorker;

    try {
      connectWorker();
    } catch (error) {
      handleStopScan();
      onErrorRef.current?.(toError(error, "Unable to create the barcode decoder worker"));
    }

    return () => {
      disposed = true;
      ensureWorkerRef.current = () => null;
      workerInvalidationListeners.delete(handleWorkerInvalidation);
      detachWorker();
      clearPendingWorkerRequest();
      if (hasWorkerLease) releaseSharedWorker();
    };
  }, [clearPendingWorkerRequest, handleStopScan]);

  useEffect(() => {
    const handlePageHide = () => handleStopScan();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [handleStopScan]);

  /**
   * Initialize and start the barcode scanning process
   */
  const handleScan = useCallback(async () => {
    // Calling start repeatedly must replace, rather than leak, an active stream.
    cancelScheduledFrame();
    releaseCamera();

    scanSessionRef.current += 1;
    const currentSession = scanSessionRef.current;
    const currentCameraRequest = ++cameraRequestRef.current;
    clearPendingWorkerRequest();
    lastScanTimeRef.current = 0;
    scanAttemptRef.current = 0;
    captureAttemptRef.current = 0;
    captureFailureCountRef.current = 0;
    videoReadinessStartedAtRef.current = null;

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
      if (!ensureWorkerRef.current()) {
        throw new Error("Barcode decoding is not supported in this browser");
      }
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
      watchActiveStream(stream, currentSession);
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
      const activeCanvas = canvas;

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

      /**
       * Animation loop for continuous barcode scanning
       */
      const scheduleNextFrame = () => {
        const video = videoRef.current;
        if (
          video?.requestVideoFrameCallback &&
          getVideoDimensions(video, activeStreamRef.current)
        ) {
          usesVideoFrameCallbackRef.current = true;
          scheduledVideoRef.current = video;
          animationFrameId.current = video.requestVideoFrameCallback(() => scanTick());
        } else {
          usesVideoFrameCallbackRef.current = false;
          scheduledVideoRef.current = null;
          animationFrameId.current = requestAnimationFrame(scanTick);
        }
      };

      function scanTick() {
        animationFrameId.current = null;
        scheduledVideoRef.current = null;
        usesVideoFrameCallbackRef.current = false;

        // Stop if session changed
        if (currentSession !== scanSessionRef.current) {
          return;
        }

        const now = Date.now();
        const timeSinceLastScan = now - lastScanTimeRef.current;

        // Throttle scan rate
        if (timeSinceLastScan < normalizedScanInterval || isWorkerBusy.current) {
          scheduleNextFrame();
          return;
        }

        lastScanTimeRef.current = now;

        try {
          const video = videoRef.current;
          const worker = workerRef.current;
          const activeStream = activeStreamRef.current;
          if (!video || !context || !worker || !activeStream) {
            scheduleNextFrame();
            return;
          }

          const dimensions = getVideoDimensions(video, activeStream);
          if (!dimensions) {
            videoReadinessStartedAtRef.current ??= now;
            if (now - videoReadinessStartedAtRef.current >= VIDEO_READINESS_TIMEOUT_MS) {
              handleStopScan();
              onErrorRef.current?.(new Error("The camera did not provide a usable video frame"));
              return;
            }
            scheduleNextFrame();
            return;
          }
          videoReadinessStartedAtRef.current = null;
          const { width, height } = dimensions;
          const scale = Math.min(MAX_SCAN_DIMENSION / width, MAX_SCAN_DIMENSION / height, 1);
          const scanWidth = Math.max(1, Math.floor(width * scale));
          const scanHeight = Math.max(1, Math.floor(height * scale));
          if (activeCanvas.width !== scanWidth) activeCanvas.width = scanWidth;
          if (activeCanvas.height !== scanHeight) activeCanvas.height = scanHeight;

          const captureAttempt = captureAttemptRef.current++;
          const shouldCaptureFullFrame =
            captureAttempt % FULL_FRAME_SCAN_INTERVAL === FULL_FRAME_SCAN_INTERVAL - 1;
          const videoRectangle = video.getBoundingClientRect?.();
          const viewfinderRectangle = viewfinderRef.current?.getBoundingClientRect();
          const sourceRegion =
            !shouldCaptureFullFrame && videoRectangle && viewfinderRectangle
              ? getViewfinderSourceRegion(width, height, videoRectangle, viewfinderRectangle)
              : null;

          let frameWidth = scanWidth;
          let frameHeight = scanHeight;
          let region: "full" | "viewfinder" = "full";

          if (sourceRegion) {
            frameWidth = Math.max(1, Math.floor(sourceRegion.width * scale));
            frameHeight = Math.max(1, Math.floor(sourceRegion.height * scale));
            region = "viewfinder";
            context.drawImage(
              video,
              sourceRegion.x,
              sourceRegion.y,
              sourceRegion.width,
              sourceRegion.height,
              0,
              0,
              frameWidth,
              frameHeight,
            );
          } else {
            context.drawImage(video, 0, 0, scanWidth, scanHeight);
          }

          const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
          const requestId = nextRequestIdRef.current++;

          // Mark worker as busy before sending
          isWorkerBusy.current = true;
          pendingRequestIdRef.current = requestId;
          workerResponseTimeoutRef.current = setTimeout(() => {
            if (
              currentSession !== scanSessionRef.current ||
              pendingRequestIdRef.current !== requestId ||
              workerRef.current !== worker
            ) {
              return;
            }
            replaceInvalidSharedWorker(
              worker,
              new Error("The barcode decoder worker did not respond in time"),
            );
          }, WORKER_RESPONSE_TIMEOUT_MS);

          // Send to worker with session ID for tracking
          worker.postMessage(
            {
              imageData,
              type: "scan",
              requestId,
              scannerId: scannerIdRef.current,
              sessionId: currentSession,
              attempt: scanAttemptRef.current++,
              region,
            },
            [imageData.data.buffer],
          );

          captureFailureCountRef.current = 0;
          scheduleNextFrame();
        } catch (error) {
          clearPendingWorkerRequest();
          captureFailureCountRef.current += 1;
          if (captureFailureCountRef.current >= MAX_CONSECUTIVE_CAPTURE_FAILURES) {
            handleStopScan();
            const cause = toError(error, "Unknown camera frame capture error");
            onErrorRef.current?.(
              new Error(`Camera frame capture failed repeatedly: ${cause.message}`),
            );
            return;
          }
          scheduleNextFrame();
        }
      }

      scheduleNextFrame();
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
    cancelScheduledFrame,
    handleStopScan,
    refreshCameraAvailability,
    clearPendingWorkerRequest,
    normalizedScanInterval,
    releaseCamera,
    releaseStream,
    watchActiveStream,
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
      clearPendingWorkerRequest();
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
      watchActiveStream(stream, currentSession);
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
      captureAttemptRef.current = 0;
      captureFailureCountRef.current = 0;
      videoReadinessStartedAtRef.current = null;
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
    clearPendingWorkerRequest,
    handleStopScan,
    refreshCameraAvailability,
    releaseCamera,
    releaseStream,
    watchActiveStream,
  ]);

  /**
   * Toggle the torch/flash
   */
  const handleToggleTorch = useCallback(async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()?.[0];
    const sessionId = scanSessionRef.current;
    const cameraRequest = cameraRequestRef.current;

    try {
      const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
        torch?: boolean;
      };
      if (!track || !capabilities?.torch) return;

      const newTorchState = !scannerState.isTorchOn;
      // Using type assertion for torch constraint which is not in standard TypeScript definitions
      // but is supported by Chrome and other browsers
      await track.applyConstraints({
        advanced: [{ torch: newTorchState } as unknown as MediaTrackConstraintSet],
      });
      if (
        sessionId !== scanSessionRef.current ||
        cameraRequest !== cameraRequestRef.current ||
        videoRef.current?.srcObject !== stream
      ) {
        return;
      }
      setScannerState((prev) => ({ ...prev, isTorchOn: newTorchState }));
    } catch (error) {
      if (
        sessionId !== scanSessionRef.current ||
        cameraRequest !== cameraRequestRef.current ||
        videoRef.current?.srcObject !== stream
      ) {
        return;
      }
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
    viewfinderRef,
    handleScan,
    handleStopScan,
    handleSwitchCamera,
    handleToggleTorch,
  };
};
