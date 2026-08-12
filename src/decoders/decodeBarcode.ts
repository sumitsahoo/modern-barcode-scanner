import { scanImageData } from "@undecaf/zbar-wasm";
import type { ScanResult } from "../types";

/**
 * Internal decoder boundary. Camera and worker code depend on this small
 * contract instead of a specific WASM package, so the engine can be replaced
 * without changing the public scanner API.
 */
export const decodeFirstBarcode = async (imageData: ImageData): Promise<ScanResult | null> => {
  // scanImageData already performs a single optimized RGBA-to-luminance pass.
  // Pre-converting the ImageData here would duplicate that work for every frame.
  const [result] = await scanImageData(imageData);
  if (!result) return null;

  return {
    typeName: result.typeName?.replace("ZBAR_", "") ?? "",
    scanData: result.decode() ?? "",
  };
};
