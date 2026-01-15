import { scanImageData } from "@undecaf/zbar-wasm";
import { convertToGrayscale } from "../utils/barcodeHelpers";

export interface ScanResult {
	typeName: string;
	scanData: string;
}

export interface WorkerMessage {
	imageData: ImageData;
	type: "scan";
	sessionId: number;
}

export interface WorkerResponse {
	found: boolean;
	sessionId: number;
	data?: ScanResult;
	error?: string;
}

self.onmessage = async ({ data: { imageData, type, sessionId } }: MessageEvent<WorkerMessage>) => {
	if (type !== "scan") return;

	try {
		const results = await scanImageData(convertToGrayscale(imageData));
		if (results.length > 0) {
			const result = results[0];
			self.postMessage({
				found: true,
				sessionId,
				data: {
					typeName: result.typeName?.replace("ZBAR_", "") ?? "",
					scanData: result.decode() ?? "",
				},
			} as WorkerResponse);
		} else {
			self.postMessage({ found: false, sessionId } as WorkerResponse);
		}
	} catch (error) {
		self.postMessage({
			found: false,
			sessionId,
			error: error instanceof Error ? error.message : "Unknown error",
		} as WorkerResponse);
	}
};
