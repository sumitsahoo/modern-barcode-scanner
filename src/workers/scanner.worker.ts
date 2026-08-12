import { decodeFirstBarcode } from "../decoders/decodeBarcode";

export interface ScanResult {
  typeName: string;
  scanData: string;
}

export interface WorkerMessage {
  imageData: ImageData;
  type: "scan";
  scannerId: number;
  sessionId: number;
}

export interface WorkerResponse {
  found: boolean;
  scannerId: number;
  sessionId: number;
  data?: ScanResult;
  error?: string;
}

const processScan = async ({ imageData, type, scannerId, sessionId }: WorkerMessage) => {
  if (type !== "scan") return;

  try {
    const result = await decodeFirstBarcode(imageData);
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
      error: error instanceof Error ? error.message : "Unknown error",
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
