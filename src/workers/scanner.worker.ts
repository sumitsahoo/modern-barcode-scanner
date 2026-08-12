import { decodeFirstBarcode } from "../decoders/decodeBarcode";
import { FrameQualityEstimator } from "../utils/frameQuality";

const ENHANCED_SCAN_INTERVAL = 3;
const MAX_CONSECUTIVE_DECODE_ERRORS = 3;
const MAX_TRACKED_SCANNERS = 16;

export type ScanRegion = "full" | "viewfinder";

export interface ScanResult {
  typeName: string;
  scanData: string;
}

export interface WorkerMessage {
  imageData: ImageData;
  type: "scan";
  scannerId: number;
  sessionId: number;
  attempt?: number;
  region?: ScanRegion;
}

export interface WorkerResponse {
  found: boolean;
  scannerId: number;
  sessionId: number;
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

interface ScannerRuntimeState {
  sessionId: number;
  consecutiveDecodeErrors: number;
  quality: Record<ScanRegion, FrameQualityEstimator>;
}

const scannerStates = new Map<number, ScannerRuntimeState>();

const getScannerState = (scannerId: number, sessionId: number): ScannerRuntimeState => {
  const current = scannerStates.get(scannerId);
  if (current?.sessionId === sessionId) return current;

  if (!current && scannerStates.size >= MAX_TRACKED_SCANNERS) {
    const oldestScannerId = scannerStates.keys().next().value;
    if (oldestScannerId !== undefined) scannerStates.delete(oldestScannerId);
  }

  const next: ScannerRuntimeState = {
    sessionId,
    consecutiveDecodeErrors: 0,
    quality: {
      full: new FrameQualityEstimator(),
      viewfinder: new FrameQualityEstimator(),
    },
  };
  scannerStates.set(scannerId, next);
  return next;
};

const processScan = async ({
  imageData,
  type,
  scannerId,
  sessionId,
  attempt = 0,
  region = "full",
}: WorkerMessage) => {
  if (type !== "scan") return;

  const scannerState = getScannerState(scannerId, sessionId);

  try {
    const quality = scannerState.quality[region].evaluate(imageData);
    if (region === "viewfinder" && !quality.acceptable) {
      self.postMessage({ found: false, scannerId, sessionId } as WorkerResponse);
      return;
    }

    // Focused camera frames normally use a low-latency pass. Every third
    // attempt and every periodic full frame enable deeper recovery options.
    const tryHarder =
      region === "full" || attempt % ENHANCED_SCAN_INTERVAL === ENHANCED_SCAN_INTERVAL - 1;
    const result = await decodeFirstBarcode(imageData, { tryHarder });
    scannerState.consecutiveDecodeErrors = 0;
    if (result) {
      self.postMessage({
        found: true,
        scannerId,
        sessionId,
        data: result,
      } as WorkerResponse);
    } else {
      self.postMessage({ found: false, scannerId, sessionId } as WorkerResponse);
    }
  } catch (error) {
    scannerState.consecutiveDecodeErrors++;
    if (scannerState.consecutiveDecodeErrors < MAX_CONSECUTIVE_DECODE_ERRORS) {
      self.postMessage({ found: false, scannerId, sessionId } as WorkerResponse);
      return;
    }

    scannerState.consecutiveDecodeErrors = 0;
    self.postMessage({
      found: false,
      scannerId,
      sessionId,
      error: `Barcode decoding failed repeatedly: ${getErrorMessage(error)}`,
    } as WorkerResponse);
  }
};

// A single worker is shared across component instances. Serialize jobs so the
// decoder's shared WASM scanner is never entered concurrently.
let decodeQueue = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
  decodeQueue = decodeQueue.then(
    () => processScan(data),
    () => processScan(data),
  );
};
