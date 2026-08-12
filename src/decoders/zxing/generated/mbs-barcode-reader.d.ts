export interface WasmPoint {
  x: number;
  y: number;
}

export interface WasmPosition {
  topLeft: WasmPoint;
  topRight: WasmPoint;
  bottomRight: WasmPoint;
  bottomLeft: WasmPoint;
}

export interface WasmReadResult {
  format: string;
  text: string;
  error: string;
  position: WasmPosition;
  symbologyIdentifier: string;
}

export interface ModernBarcodeModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  readBarcodeFromLuminance(
    bufferPointer: number,
    width: number,
    height: number,
    tryHarder: boolean,
    formats: string,
  ): WasmReadResult;
}

export interface ModernBarcodeModuleOptions {
  printErr?: (message: string) => void;
}

export default function createModernBarcodeModule(
  options?: ModernBarcodeModuleOptions,
): Promise<ModernBarcodeModule>;
