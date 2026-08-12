import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

describe("ZxingWasmDecoder", () => {
  let module: ReturnType<typeof createModuleHarness>;

  beforeEach(() => {
    module = createModuleHarness();
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
      false,
      "QR Code,Data Matrix",
    );
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

  it("does not retain or double-free a buffer when growth throws", async () => {
    const decoder = new ZxingWasmDecoder(async () => module);
    const onePixel = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
    const twoPixels = { data: new Uint8ClampedArray(8), width: 2, height: 1 } as ImageData;

    await decoder.decode(onePixel);
    module._malloc.mockImplementationOnce(() => {
      throw new Error("allocation interrupted");
    });
    await expect(decoder.decode(twoPixels)).rejects.toThrow("allocation interrupted");
    await decoder.decode(onePixel);

    expect(module._free.mock.calls.filter(([pointer]) => pointer === 16)).toHaveLength(1);
    expect(module._malloc).toHaveBeenCalledTimes(3);
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
    expect(factory).not.toHaveBeenCalled();
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
