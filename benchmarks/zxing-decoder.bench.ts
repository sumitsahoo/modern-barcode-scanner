import bwipjs from "bwip-js/node";
import { PNG } from "pngjs";
import { afterAll, beforeAll, bench, describe } from "vite-plus/test";
import { ZxingWasmDecoder } from "../src/decoders/zxing/ZxingWasmDecoder";

const decoder = new ZxingWasmDecoder();
let qrFrame: ImageData;

beforeAll(async () => {
  const png = PNG.sync.read(
    await bwipjs.toBuffer({
      bcid: "qrcode",
      text: "modern-benchmark",
      scale: 4,
      padding: 24,
      backgroundcolor: "FFFFFF",
      includetext: false,
    }),
  );
  qrFrame = {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
    colorSpace: "srgb",
  };

  // Keep module initialization, first allocation, and JIT warmup outside the
  // measured samples so this command is a stable warm-decode regression tool.
  await decoder.decode(qrFrame, { tryHarder: true });
});

afterAll(() => decoder.dispose());

describe("first-party ZXing-C++ WebAssembly warm decode", () => {
  bench("392x392 QR focused pass", async () => {
    if (!(await decoder.decode(qrFrame, { tryHarder: false }))) {
      throw new Error("Benchmark QR was not detected in the focused pass");
    }
  });

  bench("392x392 QR enhanced pass", async () => {
    if (!(await decoder.decode(qrFrame, { tryHarder: true }))) {
      throw new Error("Benchmark QR was not detected in the enhanced pass");
    }
  });
});
