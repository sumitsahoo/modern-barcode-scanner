import { describe, expect, it, vi } from "vite-plus/test";
import type { BarcodeDecoder } from "./types";

import { decodeFirstBarcode } from "./decodeBarcode";

describe("decodeFirstBarcode", () => {
  const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

  it("returns the first decoded result with a normalized type name", async () => {
    const decode = vi.fn(async () => ({ format: "QR Code", text: "https://example.com" }));
    const decoder: BarcodeDecoder = {
      decode,
    };

    await expect(decodeFirstBarcode(imageData, undefined, decoder)).resolves.toEqual({
      typeName: "QRCODE",
      scanData: "https://example.com",
    });
    expect(decode).toHaveBeenCalledWith(imageData, undefined);
  });

  it("returns null when no barcode is present", async () => {
    const decoder: BarcodeDecoder = { decode: vi.fn(async () => null) };
    await expect(decodeFirstBarcode(imageData, undefined, decoder)).resolves.toBeNull();
  });
});
