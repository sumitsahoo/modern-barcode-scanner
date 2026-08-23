import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ModernBarcodeModule, WasmReadResult } from "./generated/mbs-barcode-reader.js";
import { ZxingWasmDecoder } from "./ZxingWasmDecoder";

const noResult = (): WasmReadResult => ({
  format: "",
  text: "",
  error: "",
  position: {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
    bottomLeft: { x: 0, y: 0 },
  },
  symbologyIdentifier: "",
});

const createModuleHarness = () => {
  let nextPointer = 16;
  const module = {
    HEAPU8: new Uint8Array(128),
    _malloc: vi.fn((size: number) => {
      const pointer = nextPointer;
      nextPointer += size;
      return pointer;
    }),
    _free: vi.fn(),
    readBarcodeFromLuminance: vi.fn(() => noResult()),
  } satisfies ModernBarcodeModule;
  return module;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

describe("ZxingWasmDecoder", () => {
  let module: ReturnType<typeof createModuleHarness>;

  beforeEach(() => {
    module = createModuleHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes lazily, copies RGBA data, and forwards enhancement options", async () => {
    module.readBarcodeFromLuminance.mockReturnValue({
      ...noResult(),
      format: "QR Code",
      text: "modern",
      symbologyIdentifier: "]Q1",
    });
    const factory = vi.fn(async () => module);
    const decoder = new ZxingWasmDecoder(factory);
    const data = new Uint8ClampedArray([1, 2, 3, 255]);

    await expect(
      decoder.decode({ data, width: 1, height: 1 } as ImageData, {
        tryHarder: false,
        formats: ["QR Code", "Data Matrix"],
      }),
    ).resolves.toMatchObject({ format: "QR Code", text: "modern" });

    expect(factory).toHaveBeenCalledOnce();
    expect(module._malloc).toHaveBeenCalledWith(1);
    expect([...module.HEAPU8.subarray(16, 17)]).toEqual([2]);
    expect(module.readBarcodeFromLuminance).toHaveBeenCalledWith(
      16,
      1,
      1,
      1,
      false,
      "QR Code,Data Matrix",
    );
  });

  it("shares one initialization across concurrent decode requests", async () => {
    const initialization = deferred<ModernBarcodeModule>();
    const factory = vi.fn(() => initialization.promise);
    const decoder = new ZxingWasmDecoder(factory);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    const firstDecode = decoder.decode(frame);
    const secondDecode = decoder.decode(frame);
    expect(factory).toHaveBeenCalledOnce();

    initialization.resolve(module);
    await expect(Promise.all([firstDecode, secondDecode])).resolves.toEqual([null, null]);
    expect(factory).toHaveBeenCalledOnce();
    expect(module._malloc).toHaveBeenCalledOnce();
    expect(module.readBarcodeFromLuminance).toHaveBeenCalledTimes(2);
  });

  it("reuses and grows its frame buffer, then releases it", async () => {
    const decoder = new ZxingWasmDecoder(async () => module);
    const onePixel = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
    const twoPixels = { data: new Uint8ClampedArray(8), width: 2, height: 1 } as ImageData;

    await decoder.decode(onePixel);
    await decoder.decode(onePixel);
    expect(module._malloc).toHaveBeenCalledTimes(1);

    await decoder.decode(twoPixels);
    expect(module._free).toHaveBeenCalledWith(16);
    expect(module._malloc).toHaveBeenCalledTimes(2);

    decoder.dispose();
    expect(module._free).toHaveBeenLastCalledWith(17);
  });

  it("recreates the module without retaining or double-freeing when growth throws", async () => {
    const factory = vi.fn(async () => module);
    const decoder = new ZxingWasmDecoder(factory);
    const onePixel = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
    const twoPixels = { data: new Uint8ClampedArray(8), width: 2, height: 1 } as ImageData;

    await decoder.decode(onePixel);
    module._malloc.mockImplementationOnce(() => {
      throw new Error("allocation interrupted");
    });
    await expect(decoder.decode(twoPixels)).resolves.toBeNull();
    await decoder.decode(onePixel);

    expect(module._free.mock.calls.filter(([pointer]) => pointer === 16)).toHaveLength(1);
    expect(module._malloc).toHaveBeenCalledTimes(3);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed and excessive frames before initializing WASM", async () => {
    const factory = vi.fn(async () => module);
    const decoder = new ZxingWasmDecoder(factory);

    await expect(
      decoder.decode({ data: new Uint8ClampedArray(3), width: 1, height: 1 } as ImageData),
    ).rejects.toThrow("expected 4 bytes");
    await expect(
      decoder.decode({ data: new Uint8ClampedArray(), width: 8193, height: 4096 } as ImageData),
    ).rejects.toThrow("32-megapixel safety limit");
    await expect(
      decoder.decode({ data: new Uint8ClampedArray(4), width: 0.5, height: 2 } as ImageData),
    ).rejects.toThrow("positive integer dimensions");
    await expect(
      decoder.decode({
        data: new DataView(new ArrayBuffer(4)),
        width: 1,
        height: 1,
      } as unknown as ImageData),
    ).rejects.toThrow("expected Uint8ClampedArray");
    expect(factory).not.toHaveBeenCalled();
  });

  it("bounds and validates format filters before initializing WASM", async () => {
    const factory = vi.fn(async () => module);
    const decoder = new ZxingWasmDecoder(factory);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    await expect(decoder.decode(frame, { formats: ["QR Code,"] })).rejects.toThrow(
      "without commas",
    );
    await expect(decoder.decode(frame, { formats: ["QR Cødé"] })).rejects.toThrow("ASCII strings");
    await expect(
      decoder.decode(frame, { formats: Array.from({ length: 17 }, () => "A".repeat(64)) }),
    ).rejects.toThrow("1024 ASCII bytes");
    await expect(decoder.decode(frame, { tryHarder: "yes" as unknown as boolean })).rejects.toThrow(
      "must be a boolean",
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it("revalidates a transferred frame after asynchronous initialization", async () => {
    const initialization = deferred<ModernBarcodeModule>();
    const decoder = new ZxingWasmDecoder(() => initialization.promise);
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    const decode = decoder.decode({ data, width: 1, height: 1 } as ImageData);

    structuredClone(data.buffer, { transfer: [data.buffer] });
    initialization.resolve(module);

    await expect(decode).rejects.toThrow("detached during decoder initialization");
    expect(module.readBarcodeFromLuminance).not.toHaveBeenCalled();
  });

  it("times out initialization and permits a clean retry", async () => {
    vi.useFakeTimers();
    const never = new Promise<ModernBarcodeModule>(() => undefined);
    const factory = vi
      .fn<() => Promise<ModernBarcodeModule>>()
      .mockReturnValueOnce(never)
      .mockResolvedValue(module);
    const decoder = new ZxingWasmDecoder(factory);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    const firstDecode = decoder.decode(frame);
    const firstExpectation = expect(firstDecode).rejects.toThrow("initialization timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await firstExpectation;
    await expect(decoder.decode(frame)).resolves.toBeNull();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("makes disposal terminal and invalidates pending work", async () => {
    const decoder = new ZxingWasmDecoder(() => new Promise<ModernBarcodeModule>(() => undefined));
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
    const pendingDecode = decoder.decode(frame);
    const pendingExpectation = expect(pendingDecode).rejects.toThrow("has been disposed");

    decoder.dispose();
    decoder.dispose();

    await pendingExpectation;
    await expect(decoder.decode(frame)).rejects.toThrow("has been disposed");
    expect(module._malloc).not.toHaveBeenCalled();
    expect(module._free).not.toHaveBeenCalled();
  });

  it("does not let a pending decode allocate after disposal", async () => {
    const decoder = new ZxingWasmDecoder(async () => module);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    await decoder.decode(frame);
    const pendingDecode = decoder.decode(frame);
    decoder.dispose();

    await expect(pendingDecode).rejects.toThrow("has been disposed");
    expect(module._malloc).toHaveBeenCalledOnce();
    expect(module._free).toHaveBeenCalledOnce();
  });

  it("rejects invalid module exports and out-of-bounds native allocations", async () => {
    const invalidFactory = vi.fn(async () => ({ HEAPU8: new Uint8Array(16) }));
    const invalidDecoder = new ZxingWasmDecoder(
      invalidFactory as unknown as () => Promise<ModernBarcodeModule>,
    );
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    await expect(invalidDecoder.decode(frame)).rejects.toThrow("invalid exports");
    expect(invalidFactory).toHaveBeenCalledTimes(2);

    module._malloc.mockReturnValue(128);
    const boundsDecoder = new ZxingWasmDecoder(async () => module);
    await expect(boundsDecoder.decode(frame)).rejects.toThrow("invalid frame buffer");
    expect(module.readBarcodeFromLuminance).not.toHaveBeenCalled();
  });

  it("recreates a trapped module once and succeeds with a fresh instance", async () => {
    const trappedModule = createModuleHarness();
    trappedModule.readBarcodeFromLuminance.mockImplementation(() => {
      throw new WebAssembly.RuntimeError("unreachable");
    });
    module.readBarcodeFromLuminance.mockReturnValue({
      ...noResult(),
      format: "QR Code",
      text: "recovered",
    });
    const factory = vi
      .fn<() => Promise<ModernBarcodeModule>>()
      .mockResolvedValueOnce(trappedModule)
      .mockResolvedValueOnce(module);
    const decoder = new ZxingWasmDecoder(factory);

    await expect(
      decoder.decode({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData),
    ).resolves.toMatchObject({ format: "QR Code", text: "recovered" });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("prioritizes native errors and validates successful result metadata", async () => {
    const decoder = new ZxingWasmDecoder(async () => module);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
    module.readBarcodeFromLuminance.mockReturnValue({
      ...noResult(),
      format: "QR Code",
      text: "must-not-escape",
      error: "checksum error",
    });

    await expect(decoder.decode(frame)).rejects.toThrow("Barcode decoding failed: checksum error");
    expect(module.readBarcodeFromLuminance).toHaveBeenCalledOnce();

    const malformedModule = createModuleHarness();
    malformedModule.readBarcodeFromLuminance.mockReturnValue({
      ...noResult(),
      format: "QR Code",
      text: "invalid metadata",
      position: undefined,
    } as unknown as WasmReadResult);
    const malformedDecoder = new ZxingWasmDecoder(async () => malformedModule);
    await expect(malformedDecoder.decode(frame)).rejects.toThrow("invalid result metadata");
    expect(malformedModule.readBarcodeFromLuminance).toHaveBeenCalledTimes(2);
  });

  it("surfaces decoder errors and retries failed initialization", async () => {
    module.readBarcodeFromLuminance.mockReturnValue({ ...noResult(), error: "bad format filter" });
    const factory = vi
      .fn<() => Promise<ModernBarcodeModule>>()
      .mockRejectedValueOnce(new Error("initialization failed"))
      .mockResolvedValue(module);
    const decoder = new ZxingWasmDecoder(factory);
    const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

    await expect(decoder.decode(frame)).rejects.toThrow("initialization failed");
    await expect(decoder.decode(frame)).rejects.toThrow(
      "Barcode decoding failed: bad format filter",
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
