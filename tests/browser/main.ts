import ScannerWorker from "../../src/workers/scanner.worker.ts?worker&inline";
import type { WorkerResponse } from "../../src/workers/scanner.worker";

interface BrowserTestState {
  done: boolean;
  response?: WorkerResponse;
  error?: string;
}

declare global {
  interface Window {
    __MBS_BROWSER_TEST__: BrowserTestState;
  }
}

window.__MBS_BROWSER_TEST__ = { done: false };
const status = document.querySelector<HTMLParagraphElement>("#status");
const canvas = document.querySelector<HTMLCanvasElement>("#fixture");

const fail = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  window.__MBS_BROWSER_TEST__ = { done: true, error: message };
  if (status) status.textContent = message;
};

const run = async () => {
  if (!canvas) throw new Error("Fixture canvas is unavailable");

  const image = new Image();
  image.src = "/fixtures/worker-qr.png";
  await image.decode();

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.drawImage(image, 0, 0);

  const worker = new ScannerWorker();
  const response = await new Promise<WorkerResponse>((resolve, reject) => {
    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => resolve(event.data),
      {
        once: true,
      },
    );
    worker.addEventListener("error", (event) => reject(new Error(event.message)), { once: true });
    worker.postMessage({
      type: "scan",
      scannerId: 1,
      sessionId: 1,
      imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    });
  });
  worker.terminate();

  window.__MBS_BROWSER_TEST__ = { done: true, response };
  if (status) status.textContent = response.found ? "Decoded" : (response.error ?? "Not found");
};

void run().catch(fail);
