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
  databaromni: { height: 20 },
  databarexpanded: { height: 20 },
  databarlimited: { height: 20 },
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

const addDeterministicSensorNoise = (source: ImageData, sampleStep = 4003): ImageData => {
  const noisy = new Uint8ClampedArray(source.data);
  for (let pixel = 0; pixel < source.width * source.height; pixel += sampleStep) {
    const offset = pixel * 4;
    const value = pixel % 2 === 0 ? 0 : 255;
    noisy[offset] = value;
    noisy[offset + 1] = value;
    noisy[offset + 2] = value;
  }
  return { data: noisy, width: source.width, height: source.height } as ImageData;
};

const addScreenGlare = (source: ImageData): ImageData => {
  const glared = new Uint8ClampedArray(source.data);
  const left = Math.floor(source.width * 0.43);
  const right = Math.ceil(source.width * 0.55);
  const top = Math.floor(source.height * 0.1);
  const bottom = Math.ceil(source.height * 0.34);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * source.width + x) * 4;
      glared[offset] = 255;
      glared[offset + 1] = 255;
      glared[offset + 2] = 255;
    }
  }
  return { data: glared, width: source.width, height: source.height } as ImageData;
};

const cropCenter = (source: ImageData, ratio: number): ImageData => {
  const width = Math.floor(source.width * ratio);
  const height = Math.floor(source.height * ratio);
  const left = Math.floor((source.width - width) / 2);
  const top = Math.floor((source.height - height) / 2);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceStart = ((top + y) * source.width + left) * 4;
    data.set(source.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return { data, width, height } as ImageData;
};

const createDeterministicNoise = (
  width: number,
  height: number,
  initialSeed: number,
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = initialSeed >>> 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    data[offset] = seed >>> 24;
    data[offset + 1] = seed >>> 16;
    data[offset + 2] = seed >>> 8;
    data[offset + 3] = 255;
  }
  return { data, width, height } as ImageData;
};

describe("first-party ZXing-C++ WASM corpus", () => {
  const decoder = new ZxingWasmDecoder();

  afterAll(() => decoder.dispose());

  it.each([
    ["qrcode", "modern-qr", "QRCODE", "modern-qr"],
    ["qrcode", "日本語とemoji-📷", "QRCODE", "日本語とemoji-📷"],
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
    ["itf14", "10012345000017", "I25", "10012345000017"],
    ["databaromni", "(01)01234567890128", "DATABAR", "0101234567890128"],
    ["databarlimited", "(01)01234567890128", "DATABAR_LTD", "0101234567890128"],
    ["databarexpanded", "(01)09501101530003(10)ABC123", "DATABAR_EXP", "010950110153000310ABC123"],
    ["datamatrix", "modern-data-matrix", "DATAMATRIX", "modern-data-matrix"],
    ["pdf417", "modern-pdf417", "PDF417", "modern-pdf417"],
    ["micropdf417", "modern-micro-pdf", "PDF417", "modern-micro-pdf"],
    ["azteccode", "modern-aztec", "AZTEC", "modern-aztec"],
    ["microqrcode", "1234", "QRCODE", "1234"],
    ["rectangularmicroqrcode", "5678", "QRCODE", "5678"],
    ["telepen", "MODERN TELEPEN", "TELEPEN", "MODERN TELEPEN"],
    ["code32", "01234567", "CODE32", "A012345676"],
    ["maxicode", "modern-maxicode", "MAXICODE", "modern-maxicode"],
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

  it("decodes moderate sensor noise and localized screen glare", async () => {
    const frame = await renderBarcode({ bcid: "qrcode", text: "imperfect-phone-frame" });

    await expect(
      decodeFirstBarcode(addDeterministicSensorNoise(frame), { tryHarder: true }, decoder),
    ).resolves.toMatchObject({ scanData: "imperfect-phone-frame" });
    await expect(
      decodeFirstBarcode(addScreenGlare(frame), { tryHarder: true }, decoder),
    ).resolves.toMatchObject({ scanData: "imperfect-phone-frame" });
  });

  it("treats aggressively damaged symbols as clean misses and remains usable", async () => {
    const frame = await renderBarcode({ bcid: "qrcode", text: "crop-recovery" });

    await expect(
      decodeFirstBarcode(cropCenter(frame, 0.25), { tryHarder: true }, decoder),
    ).resolves.toBeNull();
    await expect(
      decodeFirstBarcode(addDeterministicSensorNoise(frame, 67), { tryHarder: true }, decoder),
    ).resolves.toBeNull();
    await expect(decodeFirstBarcode(frame, { tryHarder: true }, decoder)).resolves.toMatchObject({
      scanData: "crop-recovery",
    });
  });

  it("keeps varied deterministic camera noise inside the recoverable miss path", async () => {
    const dimensions = [
      [1, 1],
      [7, 13],
      [31, 47],
      [64, 64],
      [91, 127],
      [320, 240],
    ] as const;

    for (let seed = 1; seed <= 2; seed++) {
      for (const [width, height] of dimensions) {
        await expect(
          decodeFirstBarcode(
            createDeterministicNoise(width, height, seed),
            {
              tryHarder: true,
            },
            decoder,
          ),
        ).resolves.toBeNull();
      }
    }

    const recovery = await renderBarcode({ bcid: "qrcode", text: "noise-recovery" });
    await expect(decodeFirstBarcode(recovery, { tryHarder: true }, decoder)).resolves.toMatchObject(
      { scanData: "noise-recovery" },
    );
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
