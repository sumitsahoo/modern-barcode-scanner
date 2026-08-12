import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const decoderMock = vi.hoisted(() => ({
  scanImageData: vi.fn(),
}));

vi.mock("@undecaf/zbar-wasm", () => decoderMock);

import { decodeFirstBarcode } from "./decodeBarcode";

describe("decodeFirstBarcode", () => {
  const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

  beforeEach(() => decoderMock.scanImageData.mockReset());

  it("returns the first decoded result with a normalized type name", async () => {
    decoderMock.scanImageData.mockResolvedValue([
      { typeName: "ZBAR_QRCODE", decode: () => "https://example.com" },
      { typeName: "ZBAR_CODE128", decode: () => "second" },
    ]);

    await expect(decodeFirstBarcode(imageData)).resolves.toEqual({
      typeName: "QRCODE",
      scanData: "https://example.com",
    });
    expect(decoderMock.scanImageData).toHaveBeenCalledWith(imageData);
  });

  it("returns null when no barcode is present", async () => {
    decoderMock.scanImageData.mockResolvedValue([]);
    await expect(decodeFirstBarcode(imageData)).resolves.toBeNull();
  });
});
