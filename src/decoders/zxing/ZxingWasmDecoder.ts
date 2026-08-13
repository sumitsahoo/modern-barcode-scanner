import type { BarcodeDecoder, DecodeOptions, DecodedBarcode } from "../types";
import createModernBarcodeModule, {
  type ModernBarcodeModule,
  type ModernBarcodeModuleOptions,
} from "./generated/mbs-barcode-reader.js";

const RGBA_CHANNEL_COUNT = 4;
const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
const MODULE_INITIALIZATION_TIMEOUT_MS = 10_000;
const MAX_FORMAT_COUNT = 64;
const MAX_FORMAT_NAME_LENGTH = 64;
const MAX_FORMAT_FILTER_LENGTH = 1024;

type ModuleFactory = (options?: ModernBarcodeModuleOptions) => Promise<ModernBarcodeModule>;

interface ValidatedFrame {
  data: Uint8ClampedArray;
  height: number;
  pixelCount: number;
  width: number;
}

interface ValidatedDecodeOptions {
  formats: string;
  tryHarder: boolean;
}

class DecoderDisposedError extends Error {
  constructor() {
    super("Barcode decoder has been disposed");
    this.name = "DecoderDisposedError";
  }
}

class DecoderInitializationTimeoutError extends Error {
  constructor() {
    super(`Barcode engine initialization timed out after ${MODULE_INITIALIZATION_TIMEOUT_MS} ms`);
    this.name = "DecoderInitializationTimeoutError";
  }
}

class DecoderModuleIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecoderModuleIntegrityError";
  }
}

class DecoderEngineError extends Error {
  constructor(message: string) {
    super(`Barcode decoding failed: ${message}`);
    this.name = "DecoderEngineError";
  }
}

class DecoderAllocationError extends Error {
  constructor(byteLength: number) {
    super(`Unable to allocate ${byteLength} bytes for barcode decoding`);
    this.name = "DecoderAllocationError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const validateImageData = (imageData: ImageData): ValidatedFrame => {
  if (!isRecord(imageData)) {
    throw new RangeError("Barcode frames must be valid ImageData objects");
  }

  const { data, height, width } = imageData;

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Barcode frames must have positive integer dimensions");
  }

  const pixelCount = width * height;
  if (pixelCount > MAX_IMAGE_PIXELS) {
    throw new RangeError("Barcode frame exceeds the 32-megapixel safety limit");
  }

  const expectedByteLength = pixelCount * RGBA_CHANNEL_COUNT;
  if (!(data instanceof Uint8ClampedArray) || !(data.buffer instanceof ArrayBuffer)) {
    throw new RangeError("Invalid RGBA frame: expected Uint8ClampedArray pixel data");
  }
  if (data.byteLength !== expectedByteLength) {
    throw new RangeError(
      `Invalid RGBA frame: expected ${expectedByteLength} bytes, received ${data.byteLength}`,
    );
  }

  return { data, height, pixelCount, width };
};

const validateLiveFrameBuffer = ({ data, pixelCount }: ValidatedFrame): void => {
  const expectedByteLength = pixelCount * RGBA_CHANNEL_COUNT;
  if (data.byteLength !== expectedByteLength || data.buffer.byteLength === 0) {
    throw new RangeError(
      "Invalid RGBA frame: pixel data was detached during decoder initialization",
    );
  }
};

const validateDecodeOptions = (options: DecodeOptions): ValidatedDecodeOptions => {
  if (!isRecord(options)) {
    throw new RangeError("Barcode decode options must be an object");
  }
  if (options.tryHarder !== undefined && typeof options.tryHarder !== "boolean") {
    throw new RangeError("Barcode tryHarder option must be a boolean");
  }

  const formats = options.formats;
  if (formats === undefined) {
    return { formats: "", tryHarder: options.tryHarder ?? true };
  }
  if (!Array.isArray(formats) || formats.length > MAX_FORMAT_COUNT) {
    throw new RangeError(`Barcode format filters are limited to ${MAX_FORMAT_COUNT} entries`);
  }

  for (const format of formats) {
    if (
      typeof format !== "string" ||
      format.length === 0 ||
      format.length > MAX_FORMAT_NAME_LENGTH ||
      !/^[\x20-\x2b\x2d-\x7e]+$/.test(format)
    ) {
      throw new RangeError("Barcode format names must be non-empty ASCII strings without commas");
    }
  }

  const serializedFormats = formats.join(",");
  if (serializedFormats.length > MAX_FORMAT_FILTER_LENGTH) {
    throw new RangeError(
      `Barcode format filters are limited to ${MAX_FORMAT_FILTER_LENGTH} ASCII bytes`,
    );
  }
  return { formats: serializedFormats, tryHarder: options.tryHarder ?? true };
};

const validateModule = (value: unknown): ModernBarcodeModule => {
  if (
    !isRecord(value) ||
    !(value.HEAPU8 instanceof Uint8Array) ||
    typeof value._malloc !== "function" ||
    typeof value._free !== "function" ||
    typeof value.readBarcodeFromLuminance !== "function"
  ) {
    throw new DecoderModuleIntegrityError("Barcode engine initialized with invalid exports");
  }
  return value as unknown as ModernBarcodeModule;
};

const validatePoint = (value: unknown): boolean =>
  isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

const validatePosition = (value: unknown): boolean =>
  isRecord(value) &&
  validatePoint(value.topLeft) &&
  validatePoint(value.topRight) &&
  validatePoint(value.bottomRight) &&
  validatePoint(value.bottomLeft);

interface ModuleWait {
  cancel: (error: Error) => void;
  promise: Promise<ModernBarcodeModule>;
}

const waitForModule = (modulePromise: Promise<ModernBarcodeModule>): ModuleWait => {
  let cancel!: (error: Error) => void;
  const promise = new Promise<ModernBarcodeModule>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new DecoderInitializationTimeoutError());
    }, MODULE_INITIALIZATION_TIMEOUT_MS);
    cancel = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };
    modulePromise.then(
      (module) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(module);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
  return { cancel, promise };
};

const isFatalModuleFailure = (error: unknown): boolean =>
  error instanceof DecoderAllocationError ||
  error instanceof DecoderModuleIntegrityError ||
  error instanceof WebAssembly.RuntimeError ||
  typeof error === "number";

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
  private disposed = false;
  private generation = 0;
  private cancelModuleWait?: (error: Error) => void;

  constructor(private readonly createModule: ModuleFactory = createModernBarcodeModule) {}

  private assertActive(generation = this.generation): void {
    if (this.disposed || generation !== this.generation) {
      throw new DecoderDisposedError();
    }
  }

  private async getModule(generation: number): Promise<ModernBarcodeModule> {
    this.assertActive(generation);
    if (this.module) return this.module;

    if (!this.modulePromise) {
      const createdModule = Promise.resolve(
        this.createModule({
          // Decoder exceptions are returned through WasmReadResult. Keep the
          // generated runtime from writing consumer frame data to the console.
          printErr: () => undefined,
        }),
      );
      const moduleWait = waitForModule(createdModule);
      const pendingModule = moduleWait.promise.then(validateModule);
      this.modulePromise = pendingModule;
      this.cancelModuleWait = moduleWait.cancel;
      void pendingModule.then(
        () => {
          if (this.modulePromise === pendingModule) this.cancelModuleWait = undefined;
        },
        () => {
          if (this.modulePromise === pendingModule) this.cancelModuleWait = undefined;
        },
      );
    }

    const pendingModule = this.modulePromise;

    try {
      const module = await pendingModule;
      this.assertActive(generation);
      if (this.modulePromise !== pendingModule) {
        throw new DecoderModuleIntegrityError("Barcode engine initialization was superseded");
      }
      this.module = module;
      return module;
    } catch (error) {
      // A transient initialization error can be retried on a later frame.
      if (this.modulePromise === pendingModule) this.modulePromise = undefined;
      throw error;
    }
  }

  private invalidateModule(module: ModernBarcodeModule): void {
    if (this.module !== module) return;

    // A trapped module may reject native cleanup too. Drop every reference and
    // let its WebAssembly memory be reclaimed with the abandoned instance.
    this.module = undefined;
    this.modulePromise = undefined;
    this.bufferPointer = 0;
    this.bufferCapacity = 0;
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

    let pointer: number;
    try {
      pointer = module._malloc(byteLength);
    } catch {
      throw new DecoderAllocationError(byteLength);
    }
    if (!pointer) {
      this.bufferPointer = 0;
      this.bufferCapacity = 0;
      throw new DecoderAllocationError(byteLength);
    }

    this.bufferPointer = pointer;
    this.bufferCapacity = byteLength;
    return pointer;
  }

  private decodeWithModule(
    module: ModernBarcodeModule,
    frame: ValidatedFrame,
    options: ValidatedDecodeOptions,
  ): DecodedBarcode | null {
    validateLiveFrameBuffer(frame);
    const pointer = this.ensureBuffer(module, frame.pixelCount);

    // HEAPU8 can be replaced when WebAssembly memory grows, so read and check it
    // immediately before every conversion.
    const heap = module.HEAPU8;
    if (
      !Number.isSafeInteger(pointer) ||
      pointer <= 0 ||
      pointer > heap.byteLength ||
      frame.pixelCount > heap.byteLength - pointer
    ) {
      throw new DecoderModuleIntegrityError("Barcode engine allocated an invalid frame buffer");
    }
    copyLuminance(frame.data, heap, pointer);

    const result: unknown = module.readBarcodeFromLuminance(
      pointer,
      frame.pixelCount,
      frame.width,
      frame.height,
      options.tryHarder,
      options.formats,
    );

    if (
      !isRecord(result) ||
      typeof result.format !== "string" ||
      typeof result.text !== "string" ||
      typeof result.error !== "string"
    ) {
      throw new DecoderModuleIntegrityError("Barcode engine returned an invalid result");
    }
    if (result.error) {
      throw new DecoderEngineError(result.error);
    }
    if (typeof result.symbologyIdentifier !== "string" || !validatePosition(result.position)) {
      throw new DecoderModuleIntegrityError("Barcode engine returned invalid result metadata");
    }
    if (!result.format) return null;

    return {
      format: result.format,
      text: result.text,
      position: result.position,
      symbologyIdentifier: result.symbologyIdentifier,
    } as DecodedBarcode;
  }

  async decode(imageData: ImageData, options: DecodeOptions = {}): Promise<DecodedBarcode | null> {
    const generation = this.generation;
    this.assertActive(generation);
    const frame = validateImageData(imageData);
    const validatedOptions = validateDecodeOptions(options);

    for (let attempt = 0; attempt < 2; attempt++) {
      let module: ModernBarcodeModule | undefined;
      try {
        module = await this.getModule(generation);
        this.assertActive(generation);
        return this.decodeWithModule(module, frame, validatedOptions);
      } catch (error) {
        this.assertActive(generation);
        if (attempt === 0 && module && isFatalModuleFailure(error)) {
          this.invalidateModule(module);
          continue;
        }
        if (attempt === 0 && !module && error instanceof DecoderModuleIntegrityError) {
          // A malformed factory result is isolated just like a trapped module.
          continue;
        }
        throw error;
      }
    }

    return null;
  }

  dispose(): void {
    if (this.disposed) return;

    const module = this.module;
    const pointer = this.bufferPointer;
    this.disposed = true;
    this.generation++;
    const cancelModuleWait = this.cancelModuleWait;
    this.cancelModuleWait = undefined;
    this.module = undefined;
    this.modulePromise = undefined;
    this.bufferPointer = 0;
    this.bufferCapacity = 0;
    cancelModuleWait?.(new DecoderDisposedError());

    if (module && pointer) {
      try {
        module._free(pointer);
      } catch {
        // Teardown remains terminal even if an already-aborted module rejects
        // its final native cleanup call.
      }
    }
  }
}
