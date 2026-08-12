export interface BarcodePoint {
  x: number;
  y: number;
}

export interface BarcodePosition {
  topLeft: BarcodePoint;
  topRight: BarcodePoint;
  bottomRight: BarcodePoint;
  bottomLeft: BarcodePoint;
}

/** Engine-neutral result retained inside the worker boundary. */
export interface DecodedBarcode {
  format: string;
  text: string;
  position?: BarcodePosition;
  symbologyIdentifier?: string;
}

export interface DecodeOptions {
  /** Enables rotation, inversion, downscaling, and deeper detection passes. */
  tryHarder?: boolean;
  /** ZXing-C++ format names. An empty list scans every compiled reader. */
  formats?: readonly string[];
}

/**
 * Small provider contract for independently evolving WASM, native, or future
 * accelerated barcode engines without coupling them to React or camera code.
 */
export interface BarcodeDecoder {
  decode(imageData: ImageData, options?: DecodeOptions): Promise<DecodedBarcode | null>;
  dispose?(): void;
}
