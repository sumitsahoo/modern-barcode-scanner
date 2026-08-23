import { decodeFirstBarcode } from "../decoders/decodeBarcode";
import { MAX_SCAN_DIMENSION } from "../constants/scanner";
import { FrameQualityEstimator } from "../utils/frameQuality";

const ENHANCED_SCAN_INTERVAL = 3;
const MAX_CONSECUTIVE_DECODE_ERRORS = 3;
const MAX_TRACKED_SCANNERS = 16;
const MAX_IMAGE_PIXELS = MAX_SCAN_DIMENSION * MAX_SCAN_DIMENSION;

type ScanRegion = "full" | "viewfinder";

interface ScanResult {
  typeName: string;
  scanData: string;
}

export interface WorkerMessage {
  imageData: ImageData;
  type: "scan";
  scannerId: number;
  sessionId: number;
  requestId: number;
  attempt?: number;
  region?: ScanRegion;
}

export interface WorkerResponse {
  found: boolean;
  scannerId: number;
  sessionId: number;
  requestId: number;
  data?: ScanResult;
  error?: string;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number") return "Barcode engine reported an internal frame exception";

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
};

const isTerminalDecodeError = (error: unknown): boolean =>
  error instanceof RangeError ||
  error instanceof WebAssembly.RuntimeError ||
  (error instanceof Error &&
    [
      "DecoderAllocationError",
      "DecoderDisposedError",
      "DecoderInitializationTimeoutError",
      "DecoderModuleIntegrityError",
    ].includes(error.name));

interface ScannerRuntimeState {
  sessionId: number;
  latestRequestId: number;
  pendingRequestId: number | null;
  consecutiveDecodeErrors: number;
  viewfinderQuality: FrameQualityEstimator;
}

const scannerStates = new Map<number, ScannerRuntimeState>();

const createScannerState = (sessionId: number, requestId: number): ScannerRuntimeState => ({
  sessionId,
  latestRequestId: requestId,
  pendingRequestId: requestId,
  consecutiveDecodeErrors: 0,
  viewfinderQuality: new FrameQualityEstimator(),
});

const refreshScannerState = (scannerId: number, state: ScannerRuntimeState): void => {
  scannerStates.delete(scannerId);
  scannerStates.set(scannerId, state);
};

type RequestRegistration = ScannerRuntimeState | "capacity" | undefined;

const registerRequest = (
  scannerId: number,
  sessionId: number,
  requestId: number,
): RequestRegistration => {
  const current = scannerStates.get(scannerId);
  if (current) {
    if (sessionId < current.sessionId) return undefined;
    if (sessionId === current.sessionId) {
      if (requestId <= current.latestRequestId) return undefined;
      current.latestRequestId = requestId;
      current.pendingRequestId = requestId;
      refreshScannerState(scannerId, current);
      return current;
    }
  }

  if (!current && scannerStates.size >= MAX_TRACKED_SCANNERS) {
    let idleScannerId: number | undefined;
    for (const [candidateScannerId, state] of scannerStates) {
      if (state.pendingRequestId !== null) continue;
      idleScannerId = candidateScannerId;
      break;
    }
    if (idleScannerId === undefined) return "capacity";
    scannerStates.delete(idleScannerId);
  }

  const next = createScannerState(sessionId, requestId);
  refreshScannerState(scannerId, next);
  return next;
};

const isCurrentRequest = (
  scannerId: number,
  sessionId: number,
  requestId: number,
  state: ScannerRuntimeState,
): boolean =>
  scannerStates.get(scannerId) === state &&
  state.sessionId === sessionId &&
  state.latestRequestId === requestId;

const postResponse = (
  { requestId, scannerId, sessionId }: Pick<WorkerMessage, "requestId" | "scannerId" | "sessionId">,
  response: Omit<WorkerResponse, "requestId" | "scannerId" | "sessionId">,
): void => {
  self.postMessage({ ...response, scannerId, sessionId, requestId } as WorkerResponse);
};

const completeRequest = (
  message: WorkerMessage,
  state: ScannerRuntimeState,
  response: Omit<WorkerResponse, "requestId" | "scannerId" | "sessionId">,
): void => {
  const { requestId, scannerId, sessionId } = message;
  if (!isCurrentRequest(scannerId, sessionId, requestId, state)) return;

  state.pendingRequestId = null;
  postResponse(message, response);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isValidImageData = (value: unknown): value is ImageData => {
  if (!isRecord(value)) return false;
  const { data, height, width } = value;
  const pixelCount =
    typeof width === "number" && typeof height === "number" ? width * height : Number.NaN;
  return (
    data instanceof Uint8ClampedArray &&
    data.buffer instanceof ArrayBuffer &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    (width as number) > 0 &&
    (height as number) > 0 &&
    (width as number) <= MAX_SCAN_DIMENSION &&
    (height as number) <= MAX_SCAN_DIMENSION &&
    Number.isSafeInteger(pixelCount) &&
    pixelCount <= MAX_IMAGE_PIXELS &&
    data.byteLength === pixelCount * 4
  );
};

const parseWorkerMessage = (value: unknown): WorkerMessage | undefined => {
  if (!isRecord(value)) return undefined;
  const { attempt, imageData, region, requestId, scannerId, sessionId, type } = value;
  if (
    type !== "scan" ||
    !isNonNegativeSafeInteger(scannerId) ||
    !isNonNegativeSafeInteger(sessionId) ||
    !isNonNegativeSafeInteger(requestId) ||
    (attempt !== undefined && !isNonNegativeSafeInteger(attempt)) ||
    (region !== undefined && region !== "full" && region !== "viewfinder") ||
    !isValidImageData(imageData)
  ) {
    return undefined;
  }

  return {
    type,
    scannerId,
    sessionId,
    requestId,
    imageData,
    ...(attempt === undefined ? {} : { attempt }),
    ...(region === undefined ? {} : { region }),
  };
};

const getCorrelation = (
  value: unknown,
): Pick<WorkerMessage, "requestId" | "scannerId" | "sessionId"> | undefined => {
  if (!isRecord(value)) return undefined;
  const { requestId, scannerId, sessionId } = value;
  if (
    !isNonNegativeSafeInteger(scannerId) ||
    !isNonNegativeSafeInteger(sessionId) ||
    !isNonNegativeSafeInteger(requestId)
  ) {
    return undefined;
  }
  return { requestId, scannerId, sessionId };
};

const processScan = async (
  message: WorkerMessage,
  scannerState: ScannerRuntimeState,
): Promise<void> => {
  const { imageData, scannerId, sessionId, requestId, attempt = 0, region = "full" } = message;

  if (!isCurrentRequest(scannerId, sessionId, requestId, scannerState)) return;

  try {
    // Focused camera frames normally use a low-latency pass. Every third
    // attempt and every periodic full frame enable deeper recovery options.
    const tryHarder =
      region === "full" || attempt % ENHANCED_SCAN_INTERVAL === ENHANCED_SCAN_INTERVAL - 1;

    if (region === "viewfinder") {
      const quality = scannerState.viewfinderQuality.evaluate(imageData);
      // Aggregate exposure/glare metrics can undervalue a valid code occupying
      // a smaller part of a bright phone screen. Preserve one focused recovery
      // pass every third attempt while still skipping the other low-value frames.
      if (!quality.acceptable && !tryHarder) {
        completeRequest(message, scannerState, { found: false });
        return;
      }
    }

    const result = await decodeFirstBarcode(imageData, { tryHarder });
    if (!isCurrentRequest(scannerId, sessionId, requestId, scannerState)) return;

    scannerState.consecutiveDecodeErrors = 0;
    if (result) {
      completeRequest(message, scannerState, {
        found: true,
        data: result,
      });
    } else {
      completeRequest(message, scannerState, { found: false });
    }
  } catch (error) {
    if (!isCurrentRequest(scannerId, sessionId, requestId, scannerState)) return;

    if (isTerminalDecodeError(error)) {
      scannerState.consecutiveDecodeErrors = 0;
      completeRequest(message, scannerState, {
        found: false,
        error: `Barcode decoding failed: ${getErrorMessage(error)}`,
      });
      return;
    }

    scannerState.consecutiveDecodeErrors++;
    if (scannerState.consecutiveDecodeErrors < MAX_CONSECUTIVE_DECODE_ERRORS) {
      completeRequest(message, scannerState, { found: false });
      return;
    }

    scannerState.consecutiveDecodeErrors = 0;
    completeRequest(message, scannerState, {
      found: false,
      error: `Barcode decoding failed repeatedly: ${getErrorMessage(error)}`,
    });
  }
};

interface QueuedScan {
  message: WorkerMessage;
  scannerState: ScannerRuntimeState;
}

// A single worker is shared across component instances. Keep at most one
// queued frame per scanner and enter the shared WASM decoder serially. This
// releases superseded transferred buffers immediately instead of retaining
// them in a promise chain during a cold module start or a slow decode.
const queuedScans: QueuedScan[] = [];
let isProcessingQueue = false;

const discardQueuedScans = (scannerId: number): void => {
  for (let index = queuedScans.length - 1; index >= 0; index--) {
    if (queuedScans[index].message.scannerId === scannerId) queuedScans.splice(index, 1);
  }
};

const reportUnexpectedScanFailure = (
  message: WorkerMessage,
  scannerState: ScannerRuntimeState,
  error: unknown,
): void => {
  if (!isCurrentRequest(message.scannerId, message.sessionId, message.requestId, scannerState)) {
    return;
  }

  try {
    completeRequest(message, scannerState, {
      found: false,
      error: `Scanner worker failed: ${getErrorMessage(error)}`,
    });
  } catch {
    // Posting can fail during worker teardown. The queue must still drain so
    // no transferred frame remains retained by this worker instance.
  }
};

const drainDecodeQueue = async (): Promise<void> => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (queuedScans.length > 0) {
      const job = queuedScans.shift();
      if (!job) continue;

      try {
        await processScan(job.message, job.scannerState);
      } catch (error) {
        reportUnexpectedScanFailure(job.message, job.scannerState, error);
      }
    }
  } finally {
    isProcessingQueue = false;
    // A message event can enqueue work between the final length check and the
    // flag reset. Re-enter once so that race cannot strand the new frame.
    if (queuedScans.length > 0) void drainDecodeQueue();
  }
};

self.onmessage = ({ data }: MessageEvent<unknown>) => {
  const message = parseWorkerMessage(data);
  if (!message) {
    const correlation = getCorrelation(data);
    if (correlation) {
      postResponse(correlation, { found: false, error: "Invalid scanner worker request" });
    }
    return;
  }

  const scannerState = registerRequest(message.scannerId, message.sessionId, message.requestId);
  if (scannerState === "capacity") {
    postResponse(message, { found: false, error: "Scanner worker capacity reached" });
    return;
  }
  if (!scannerState) return;

  discardQueuedScans(message.scannerId);
  queuedScans.push({ message, scannerState });
  void drainDecodeQueue();
};
