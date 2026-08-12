import { decodeFirstBarcode } from "../decoders/decodeBarcode";

const ENHANCED_SCAN_INTERVAL = 3;

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

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
};

const processScan = async ({
  imageData,
  type,
  scannerId,
  sessionId,
  attempt = 0,
}: WorkerMessage) => {
  if (type !== "scan") return;

  try {
    // Most camera frames use a low-latency pass. Every third miss enables
    // rotation, inversion, and downscaling to recover difficult barcodes.
    const tryHarder = attempt % ENHANCED_SCAN_INTERVAL === ENHANCED_SCAN_INTERVAL - 1;
    const result = await decodeFirstBarcode(imageData, { tryHarder });
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
    self.postMessage({
      found: false,
      scannerId,
      sessionId,
      error: getErrorMessage(error),
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
