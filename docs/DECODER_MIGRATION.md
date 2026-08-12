# First-party barcode engine migration

## Outcome

Modern Barcode Scanner now owns its barcode WebAssembly integration, build, artifacts, compatibility layer, tests, and release path. The runtime dependency on `@undecaf/zbar-wasm` is removed.

The engine is a reader-only [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) WebAssembly build. ZXing-C++ was selected instead of writing a new decoding algorithm from scratch because barcode correctness requires a large standards and image corpus; it is actively developed, Apache-2.0 licensed, browser-compatible through WebAssembly, and supports both the existing formats and useful modern 2D formats.

## Goals and decisions

| Goal                        | Decision                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Modern technology           | Pin ZXing-C++ 3.1.1 and Emscripten 4.0.20; build C++20 to WebAssembly.                                                    |
| Better performance          | Compile reader-only at `-O3`, score frame quality off-thread, prioritize the viewfinder, and reuse luminance memory.      |
| Modular design              | Keep camera capture, worker scheduling, engine provider, result normalization, and generated runtime in separate modules. |
| Smart future enhancements   | Preserve an engine-neutral `BarcodeDecoder` contract and decode options for format hints and deeper detection passes.     |
| Broad browser support       | Inline WASM in the Blob worker and test the exact worker path in Chromium, Firefox, and WebKit.                           |
| Zero consumer configuration | Continue shipping one self-contained JS runtime with no worker or `.wasm` URL to host.                                    |

## Architecture

1. `useScanner` owns camera lifecycle, downscaling, frame throttling, viewfinder-to-video mapping, and periodic full-frame recovery.
2. `scanner.worker.ts` owns backpressure, frame-quality gating, transient-failure tolerance, and serialized decoder requests.
3. `decodeBarcode.ts` is the engine-neutral public-result adapter.
4. `BarcodeDecoder` defines the provider contract.
5. `ZxingWasmDecoder` owns lazy initialization, buffer validation, WASM memory reuse, options, and cleanup.
6. The generated single-file Emscripten runtime lives under `src/decoders/zxing/generated` with a checksum.
7. `engine/wasm` and `scripts/build-barcode-engine.sh` regenerate those artifacts from locked sources.

The public `ScanResult`, component props, ref methods, camera behavior, and zero-bundler-configuration contract remain unchanged. A compatibility normalizer retains existing names such as `QRCODE`, `CODE128`, `I25`, `UPCA`, and `ISBN13` even where ZXing-C++ uses different labels or retail-code aliases.

## Build ownership and supply chain

- ZXing-C++ version: `3.1.1`
- ZXing-C++ commit: `287c85df6f961c8efbfb5ffd736cd9457b8b890e`
- Source archive SHA-256: `97d952c661b1f79d21aacc2ec544ef05c4d1465f55692cc49622ea6a8166ca7b`
- Emscripten: `4.0.20`
- Container manifest digest: `sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7`
- Writers and filesystem support: disabled
- C++ exception catches: enabled only on the JavaScript boundary wrapper so raw Emscripten exception pointers never reach consumers
- WebAssembly memory: grows when necessary; one single-byte luminance input allocation is reused
- Runtime environments: browser main threads and workers; scanner decoding runs in a worker

Regenerate and verify:

```bash
npm run engine:build
npm run engine:verify
```

The build downloads the exact source archive, verifies it before extraction, runs the digest-pinned toolchain, and writes only generated JavaScript artifacts plus SHA-256 checksums. Dependency information is recorded in `engine/wasm/source-lock.json` and `engine/wasm/sbom.spdx.json`. License details are in `THIRD_PARTY_NOTICES.md` and `licenses/ZXING-CPP-APACHE-2.0.txt`.

## Format coverage

The build supports the previous ZBar set:

- QR Code
- Code 39, Code 93, Code 128, Codabar
- EAN-2/5/8/13, UPC-A/E, ISBN
- ITF / ITF-14
- GS1 DataBar variants

It also adds:

- Data Matrix
- PDF417, Compact PDF417, MicroPDF417
- Aztec and Aztec Rune
- MaxiCode
- Micro QR and rectangular Micro QR (rMQR)
- Telepen, Code 32, and DX Film Edge

## Validation gates

Automated validation covers:

- real independently generated QR, Code 128, Code 39, EAN-13, UPC-A, ITF, Data Matrix, PDF417, and Aztec images;
- rotated and inverted input, explicit format filtering, blank negative frames, invalid dimensions, malformed buffers, and the 32-megapixel safety limit;
- lazy initialization, transient initialization retry, WASM allocation reuse/growth/cleanup, result naming, worker error propagation, and serialized worker jobs;
- motion, blur, contrast, exposure, and glare scoring against synthetic edge cases and a real QR fixture;
- `object-fit: cover` viewfinder mapping, four focused passes per periodic full-frame recovery pass, and isolated decode-failure recovery;
- all existing component, accessibility, camera cleanup, multi-instance, session, stale-result, sound, and utility regressions;
- deterministic desktop, portrait, compact, and short-landscape layouts, including dark mode, reduced motion, and dialog focus containment;
- manual visual review of idle, starting, active, result, and recoverable-error states at desktop, tablet, and mobile widths, including the 320 px and 414 px mobile safety widths;
- the self-contained Blob worker in Chromium, Firefox, and WebKit;
- the full Chromium fake-camera path from `getUserMedia` through React and the worker to `onScan`;
- production ESM/CJS builds, declarations, package contents, dependency audit, artifact hashes, and bundle size.

Run the normal gates with:

```bash
npm run check
npm test
npm run test:browser
npm run build
npm pack --dry-run
```

### Verification snapshot (2026-08-12)

| Gate                        | Verified result                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration tests  | 113 passed, including icon-contract, frame-quality, viewfinder-mapping, real-image, and engine-exception cases                           |
| Browser matrix              | 15 passed locally: responsive UI and worker tests in Chromium/WebKit plus the complete Chromium fake-camera pipeline                     |
| Responsive visual audit     | 25 state/layout combinations reviewed at 1440×900, 768×1024, 375×812, 320×568, and 414×896; Hallmark found 0 critical/major/minor issues |
| Dependency audit            | 0 known vulnerabilities                                                                                                                  |
| Engine reproducibility      | 3 fresh builds produced SHA-256 `4c7b8d43e6122c5c38147c5298372188ec2be7dc2bd11689f157426759b4abc3`                                       |
| Production bundle           | ESM 464.61 kB gzip; CJS 461.55 kB gzip                                                                                                   |
| Package dry run             | 61 files, 997.7 kB tarball; README, design screenshot/audit, licenses, source lock, SBOM, and migration guide included                   |
| Local warm decode benchmark | 392×392 QR, 250 scans: 0.50 ms p50, 0.58 ms p95                                                                                          |

The Firefox Playwright project remains part of the repository and CI browser matrix. On the 2026-08-12 local macOS verification host, the bundled Firefox runtime stalled during browser launch before any application code executed; Chromium and WebKit completed the same UI and worker assertions successfully. This is recorded as a host-runtime limitation rather than an application failure.

The complete responsive findings and maintained visual reference are in [DESIGN_AUDIT.md](./DESIGN_AUDIT.md).

The timing sample was collected on an Apple Silicon development machine and is a regression reference, not a device-wide performance guarantee. Browser, Android, and iOS performance varies with hardware, camera resolution, thermal state, and barcode quality.

## Browser support

The decoder requires WebAssembly, Web Workers, typed arrays, and Blob URLs; live scanning additionally requires `mediaDevices.getUserMedia`, a video element, and Canvas 2D. This covers current Chromium browsers (including Edge and Android), Firefox, and Safari/WebKit (including iOS). Camera access still requires HTTPS or localhost and user permission.

`BarcodeDetector` is intentionally not required. It remains a possible opt-in fast path after checking format availability, but inconsistent browser and format coverage make it unsuitable as the only decoder.

## Smart enhancements and roadmap

The provider boundary supports incremental enhancements without changing the component API:

Three smart enhancements are active:

1. Two low-latency passes are followed by a deeper rotate/invert/downscale pass after misses.
2. A bounded luminance sampler scores motion, blur, contrast, exposure, and glare in the worker. Low-value focused frames skip WASM, while periodic full-frame recovery is never quality-gated.
3. The visible viewfinder is mapped through `object-fit: cover` into source-camera pixels. Four smaller focused passes are followed by one complete, deeper frame pass so off-center and difficult barcodes still recover.

Further work can build on that scheduler:

1. Send format hints from application configuration to reduce work when the barcode family is known.
2. Track recent candidate positions for region-of-interest rescans without storing decoded payloads.
3. Experiment with `VideoFrame`/WebCodecs and WebGPU preprocessing behind capability checks while preserving the RGBA fallback.
4. Add multi-symbol results through a versioned opt-in API after the single-result compatibility path remains stable.
5. Maintain a growing licensed device/camera corpus and record p50/p95 cold and warm decode metrics in CI or a dedicated benchmark lab.

## Rollback

The implementation is isolated behind `BarcodeDecoder`. If a release-blocking regression is discovered, a temporary provider can be substituted without changing camera or React APIs. Reintroducing the old npm package is not the preferred rollback because it restores the aging toolchain and LGPL artifact; use a pinned comparison provider only long enough to diagnose a parity gap.
