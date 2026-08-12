import type { BarcodeDecoder, DecodeOptions, DecodedBarcode } from "../types";
import createModernBarcodeModule, {
  type ModernBarcodeModule,
  type ModernBarcodeModuleOptions,
} from "./generated/mbs-barcode-reader.js";

const RGBA_CHANNEL_COUNT = 4;
const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;

type ModuleFactory = (options?: ModernBarcodeModuleOptions) => Promise<ModernBarcodeModule>;

const validateImageData = (imageData: ImageData): number => {
  const { data, height, width } = imageData;

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Barcode frames must have positive integer dimensions");
  }

  const pixelCount = width * height;
  if (pixelCount > MAX_IMAGE_PIXELS) {
    throw new RangeError("Barcode frame exceeds the 32-megapixel safety limit");
  }

  const expectedByteLength = pixelCount * RGBA_CHANNEL_COUNT;
  if (data.byteLength !== expectedByteLength) {
    throw new RangeError(
      `Invalid RGBA frame: expected ${expectedByteLength} bytes, received ${data.byteLength}`,
    );
  }

  return pixelCount;
};

const copyLuminance = (
  source: Uint8ClampedArray,
  destination: Uint8Array,
  destinationOffset: number,
): void => {
  // Match ZXing-C++ RGBToLum exactly while writing straight into WASM. This
  // avoids a temporary array, a four-byte-per-pixel copy, and a second C++
  // conversion pass.
  for (let sourceOffset = 0; sourceOffset < source.length; sourceOffset += RGBA_CHANNEL_COUNT) {
    destination[destinationOffset++] =
      (306 * source[sourceOffset] +
        601 * source[sourceOffset + 1] +
        117 * source[sourceOffset + 2] +
        0x200) >>
      10;
  }
};

/** First-party ZXing-C++ WebAssembly provider used inside the scanner worker. */
export class ZxingWasmDecoder implements BarcodeDecoder {
  private module?: ModernBarcodeModule;
  private modulePromise?: Promise<ModernBarcodeModule>;
  private bufferPointer = 0;
  private bufferCapacity = 0;

  constructor(private readonly createModule: ModuleFactory = createModernBarcodeModule) {}

  private async getModule(): Promise<ModernBarcodeModule> {
    if (this.module) return this.module;

    this.modulePromise ??= this.createModule({
      // Decoder exceptions are returned through WasmReadResult. Keep the
      // generated runtime from writing consumer frame data to the console.
      printErr: () => undefined,
    });

    try {
      this.module = await this.modulePromise;
      return this.module;
    } catch (error) {
      // A transient initialization error can be retried on a later frame.
      this.modulePromise = undefined;
      throw error;
    }
  }

  private ensureBuffer(module: ModernBarcodeModule, byteLength: number): number {
    if (this.bufferPointer && this.bufferCapacity >= byteLength) {
      return this.bufferPointer;
    }

    if (this.bufferPointer) {
      module._free(this.bufferPointer);
      this.bufferPointer = 0;
      this.bufferCapacity = 0;
    }

    const pointer = module._malloc(byteLength);
    if (!pointer) {
      this.bufferPointer = 0;
      this.bufferCapacity = 0;
      throw new Error(`Unable to allocate ${byteLength} bytes for barcode decoding`);
    }

    this.bufferPointer = pointer;
    this.bufferCapacity = byteLength;
    return pointer;
  }

  async decode(imageData: ImageData, options: DecodeOptions = {}): Promise<DecodedBarcode | null> {
    const pixelCount = validateImageData(imageData);
    const module = await this.getModule();
    const pointer = this.ensureBuffer(module, pixelCount);

    // HEAPU8 can be replaced when WebAssembly memory grows, so read it from
    // the module immediately before every conversion.
    copyLuminance(imageData.data, module.HEAPU8, pointer);

    const result = module.readBarcodeFromLuminance(
      pointer,
      imageData.width,
      imageData.height,
      options.tryHarder ?? true,
      options.formats?.join(",") ?? "",
    );

    if (!result.format) {
      if (result.error) {
        throw new Error(`Barcode decoding failed: ${result.error}`);
      }
      return null;
    }

    return {
      format: result.format,
      text: result.text,
      position: result.position,
      symbologyIdentifier: result.symbologyIdentifier,
    };
  }

  dispose(): void {
    if (this.module && this.bufferPointer) {
      this.module._free(this.bufferPointer);
    }
    this.bufferPointer = 0;
    this.bufferCapacity = 0;
  }
}
