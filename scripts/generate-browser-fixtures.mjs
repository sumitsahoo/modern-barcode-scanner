import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bwipjs from "bwip-js";
import { PNG } from "pngjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(scriptDirectory, "../tests/browser/public/fixtures");
await mkdir(fixtureDirectory, { recursive: true });

const qrCode = await bwipjs.toBuffer({
  bcid: "qrcode",
  text: "modern-browser-worker",
  scale: 4,
  padding: 24,
  backgroundcolor: "FFFFFF",
});

await writeFile(resolve(fixtureDirectory, "worker-qr.png"), qrCode);

const decoded = PNG.sync.read(qrCode);
const videoWidth = 640;
const videoHeight = 480;
const frameHeader = Buffer.from("YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\nFRAME\n");
const luminance = Buffer.alloc(videoWidth * videoHeight, 235);
const chromaSize = (videoWidth / 2) * (videoHeight / 2);
const chromaU = Buffer.alloc(chromaSize, 128);
const chromaV = Buffer.alloc(chromaSize, 128);
const offsetX = Math.floor((videoWidth - decoded.width) / 2);
const offsetY = Math.floor((videoHeight - decoded.height) / 2);

for (let y = 0; y < decoded.height; y++) {
  for (let x = 0; x < decoded.width; x++) {
    const sourceOffset = (y * decoded.width + x) * 4;
    const isDark = decoded.data[sourceOffset] < 128 && decoded.data[sourceOffset + 3] > 0;
    luminance[(y + offsetY) * videoWidth + x + offsetX] = isDark ? 16 : 235;
  }
}

await writeFile(
  resolve(fixtureDirectory, "camera-qr.y4m"),
  Buffer.concat([frameHeader, luminance, chromaU, chromaV]),
);
