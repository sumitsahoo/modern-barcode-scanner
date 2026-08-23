import type { ScanResult } from "../types";
import { normalizeDecodedBarcode } from "./normalizeFormat";
import type { BarcodeDecoder, DecodeOptions } from "./types";
import { ZxingWasmDecoder } from "./zxing/ZxingWasmDecoder";

const defaultDecoder: BarcodeDecoder = new ZxingWasmDecoder();

/**
 * Internal decoder boundary. Camera and worker code depend on this small
 * contract instead of a specific WASM package, so the engine can be replaced
 * without changing the public scanner API.
 */
export const decodeFirstBarcode = async (
  imageData: ImageData,
  options?: DecodeOptions,
  decoder: BarcodeDecoder = defaultDecoder,
): Promise<ScanResult | null> => {
  const result = await decoder.decode(imageData, options);
  if (!result) return null;

  return normalizeDecodedBarcode(result.format, result.text);
};
