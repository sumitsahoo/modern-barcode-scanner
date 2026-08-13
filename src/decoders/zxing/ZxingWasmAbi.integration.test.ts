import bwipjs from "bwip-js";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import createModernBarcodeModule, {
  type ModernBarcodeModule,
} from "./generated/mbs-barcode-reader.js";

const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;

const renderQrLuminance = async (text: string) => {
  const render = bwipjs.toBuffer as unknown as (
    options: Record<string, unknown>,
  ) => Promise<Buffer>;
  const png = PNG.sync.read(
    await render({
      bcid: "qrcode",
      text,
      scale: 4,
      padding: 20,
      backgroundcolor: "FFFFFF",
      includetext: false,
    }),
  );
  const luminance = new Uint8Array(png.width * png.height);

  for (let source = 0, target = 0; source < png.data.length; source += 4, target++) {
    luminance[target] =
      (306 * png.data[source] + 601 * png.data[source + 1] + 117 * png.data[source + 2] + 0x200) >>
      10;
  }

  return { height: png.height, luminance, width: png.width };
};

describe("ZXing-C++ WebAssembly ABI", () => {
  let module: ModernBarcodeModule;

  beforeAll(async () => {
    module = await createModernBarcodeModule({ printErr: () => undefined });
  });

  it("rejects inconsistent dimensions and byte lengths before decoding", () => {
    const pointer = module._malloc(256);
    expect(pointer).not.toBe(0);

    try {
      expect(module.readBarcodeFromLuminance(0, 1, 1, 1, false, "")).toMatchObject({
        error: "Invalid luminance image buffer",
      });
      expect(module.readBarcodeFromLuminance(pointer, 0, 0, 1, false, "")).toMatchObject({
        error: "Invalid luminance image buffer",
      });
      expect(module.readBarcodeFromLuminance(pointer, 1, 1, -1, false, "")).toMatchObject({
        error: "Invalid luminance image buffer",
      });
      expect(module.readBarcodeFromLuminance(pointer, 1, 16, 16, false, "")).toMatchObject({
        error: "Luminance buffer length does not match image dimensions",
      });
      expect(module.readBarcodeFromLuminance(pointer, 1, 65_536, 1, false, "")).toMatchObject({
        error: "Luminance image dimensions exceed the decoder limit",
      });
      expect(
        module.readBarcodeFromLuminance(pointer, MAX_IMAGE_PIXELS + 1, 8193, 4096, false, ""),
      ).toMatchObject({ error: "Luminance image exceeds the 32-megapixel safety limit" });
    } finally {
      module._free(pointer);
    }
  });

  it("returns a structured error when a claimed buffer crosses the Wasm heap boundary", () => {
    expect(module.readBarcodeFromLuminance(module.HEAPU8.length, 1, 1, 1, false, "")).toMatchObject(
      { error: "Luminance buffer lies outside WebAssembly memory" },
    );
    expect(() =>
      module.readBarcodeFromLuminance(module.HEAPU8.length - 1, 256, 16, 16, false, ""),
    ).not.toThrow();
    expect(
      module.readBarcodeFromLuminance(module.HEAPU8.length - 1, 256, 16, 16, false, ""),
    ).toMatchObject({ error: "Luminance buffer lies outside WebAssembly memory" });
  });

  it("accepts the exact 32-megapixel safety boundary", () => {
    const width = 8192;
    const height = 4096;
    const pointer = module._malloc(MAX_IMAGE_PIXELS);
    expect(pointer).not.toBe(0);

    try {
      module.HEAPU8.fill(255, pointer, pointer + MAX_IMAGE_PIXELS);
      expect(
        module.readBarcodeFromLuminance(pointer, MAX_IMAGE_PIXELS, width, height, false, "QR Code"),
      ).toMatchObject({ format: "", error: "" });
    } finally {
      module._free(pointer);
    }
  });

  it("bounds format filters and converts parser failures to structured errors", () => {
    const pointer = module._malloc(1);
    expect(pointer).not.toBe(0);

    try {
      expect(
        module.readBarcodeFromLuminance(pointer, 1, 1, 1, false, "Q".repeat(1025)),
      ).toMatchObject({ error: "Barcode format filter exceeds the safety limit" });
      expect(
        module.readBarcodeFromLuminance(pointer, 1, 1, 1, false, "not-a-format"),
      ).toMatchObject({
        error: expect.stringContaining("not a valid barcode format"),
      });
    } finally {
      module._free(pointer);
    }
  });

  it("returns payload-faithful plain text including control characters", async () => {
    const payload = "embedded\0nul\u001dgroup";
    const { height, luminance, width } = await renderQrLuminance(payload);
    const pointer = module._malloc(luminance.byteLength);
    expect(pointer).not.toBe(0);

    try {
      module.HEAPU8.set(luminance, pointer);
      expect(
        module.readBarcodeFromLuminance(
          pointer,
          luminance.byteLength,
          width,
          height,
          true,
          "QR Code",
        ),
      ).toMatchObject({ format: "QR Code", text: payload, error: "" });
    } finally {
      module._free(pointer);
    }
  });
});
