import bwipjs from "bwip-js";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { decodeFirstBarcode } from "../decodeBarcode";
import { ZxingWasmDecoder } from "./ZxingWasmDecoder";

interface FixtureOptions {
  bcid: string;
  text: string;
}

const FIXTURE_OVERRIDES: Readonly<Record<string, Record<string, unknown>>> = {
  code93: { includecheck: true, scale: 8 },
  rectangularmicroqrcode: { version: "R7x43" },
};

const renderBarcode = async ({ bcid, text }: FixtureOptions): Promise<ImageData> => {
  // @types/bwip-js trails the package's Promise API and generic renderer
  // options, so keep the compatibility cast isolated to this fixture helper.
  const render = bwipjs.toBuffer as unknown as (
    options: Record<string, unknown>,
  ) => Promise<Buffer>;
  const encoded = await render({
    bcid,
    text,
    scale: 4,
    padding: 24,
    backgroundcolor: "FFFFFF",
    includetext: false,
    ...FIXTURE_OVERRIDES[bcid],
  });
  const png = PNG.sync.read(encoded);

  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: "srgb",
  } as ImageData;
};

const rotateClockwise = (source: ImageData): ImageData => {
  const rotated = new Uint8ClampedArray(source.data.length);
  for (let sourceY = 0; sourceY < source.height; sourceY++) {
    for (let sourceX = 0; sourceX < source.width; sourceX++) {
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetX = source.height - sourceY - 1;
      const targetY = sourceX;
      const targetOffset = (targetY * source.height + targetX) * 4;
      rotated.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }

  return {
    data: rotated,
    width: source.height,
    height: source.width,
    colorSpace: "srgb",
  } as ImageData;
};

const invert = (source: ImageData): ImageData => {
  const inverted = new Uint8ClampedArray(source.data);
  for (let index = 0; index < inverted.length; index += 4) {
    inverted[index] = 255 - inverted[index];
    inverted[index + 1] = 255 - inverted[index + 1];
    inverted[index + 2] = 255 - inverted[index + 2];
  }
  return {
    data: inverted,
    width: source.width,
    height: source.height,
    colorSpace: "srgb",
  } as ImageData;
};

describe("first-party ZXing-C++ WASM corpus", () => {
  const decoder = new ZxingWasmDecoder();

  afterAll(() => decoder.dispose());

  it.each([
    ["qrcode", "modern-qr", "QRCODE", "modern-qr"],
    ["code128", "MODERN-128", "CODE128", "MODERN-128"],
    ["code39", "MODERN39", "CODE39", "MODERN39"],
    ["code93", "THIS IS CODE 93", "CODE93", "THIS IS CODE 93"],
    ["rationalizedCodabar", "A0123456789B", "CODABAR", "A0123456789B"],
    ["ean8", "95200002", "EAN8", "95200002"],
    ["ean13", "5901234123457", "EAN13", "5901234123457"],
    ["upca", "012345678905", "UPCA", "012345678905"],
    ["upce", "01234558", "UPCE", "01234558"],
    ["isbn", "978-1-56581-231-4", "ISBN13", "9781565812314"],
    ["interleaved2of5", "12345670", "I25", "12345670"],
    ["datamatrix", "modern-data-matrix", "DATAMATRIX", "modern-data-matrix"],
    ["pdf417", "modern-pdf417", "PDF417", "modern-pdf417"],
    ["micropdf417", "modern-micro-pdf", "PDF417", "modern-micro-pdf"],
    ["azteccode", "modern-aztec", "AZTEC", "modern-aztec"],
    ["microqrcode", "1234", "QRCODE", "1234"],
    ["rectangularmicroqrcode", "5678", "QRCODE", "5678"],
  ])("decodes %s", async (bcid, text, typeName, scanData) => {
    const frame = await renderBarcode({ bcid, text });
    await expect(decodeFirstBarcode(frame, undefined, decoder)).resolves.toEqual({
      typeName,
      scanData,
    });
  });

  it("detects rotated and inverted camera frames in enhancement mode", async () => {
    const frame = await renderBarcode({ bcid: "qrcode", text: "enhanced-frame" });

    await expect(
      decodeFirstBarcode(rotateClockwise(frame), { tryHarder: true }, decoder),
    ).resolves.toMatchObject({ scanData: "enhanced-frame" });
    await expect(
      decodeFirstBarcode(invert(frame), { tryHarder: true }, decoder),
    ).resolves.toMatchObject({ scanData: "enhanced-frame" });
  });

  it("honors format filters and rejects negative frames", async () => {
    const qrFrame = await renderBarcode({ bcid: "qrcode", text: "filtered" });
    await expect(
      decodeFirstBarcode(qrFrame, { formats: ["Code 128"] }, decoder),
    ).resolves.toBeNull();

    const whiteFrame = {
      data: new Uint8ClampedArray(320 * 240 * 4).fill(255),
      width: 320,
      height: 240,
      colorSpace: "srgb",
    } as ImageData;
    await expect(decodeFirstBarcode(whiteFrame, undefined, decoder)).resolves.toBeNull();
  });

  it("converts C++ format exceptions into descriptive JavaScript errors", async () => {
    const frame = await renderBarcode({ bcid: "qrcode", text: "invalid-format" });

    await expect(decoder.decode(frame, { formats: ["not-a-format"] })).rejects.toThrow(
      /^Barcode decoding failed:/,
    );
  });
});
