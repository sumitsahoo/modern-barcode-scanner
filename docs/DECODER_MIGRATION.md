# First-party barcode engine migration

## Outcome

Modern Barcode Scanner now owns its barcode WebAssembly integration, build, artifacts, compatibility layer, tests, and release path. The runtime dependency on `@undecaf/zbar-wasm` is removed.

The engine is a reader-only [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) WebAssembly build. ZXing-C++ was selected instead of writing a new decoding algorithm from scratch because barcode correctness requires a large standards and image corpus; it is actively developed, Apache-2.0 licensed, browser-compatible through WebAssembly, and supports both the existing formats and useful modern 2D formats.

## Goals and decisions

| Goal                        | Decision                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modern technology           | Pin the current stable ZXing-C++ 3.1.1 and Emscripten 6.0.8 releases; build C++20 to WebAssembly.                                                                            |
| Better performance          | Compile reader-only at `-O3` with interprocedural optimization, score frame quality off-thread, coalesce queued work, prioritize the viewfinder, and reuse luminance memory. |
| Modular design              | Keep camera capture, worker scheduling, engine provider, result normalization, and generated runtime in separate modules.                                                    |
| Smart future enhancements   | Preserve an engine-neutral `BarcodeDecoder` contract and decode options for format hints and deeper detection passes.                                                        |
| Broad browser support       | Inline WASM in the Blob worker and test the exact worker path in Chromium, Firefox, and WebKit.                                                                              |
| Zero consumer configuration | Continue shipping one self-contained JS runtime with no worker or `.wasm` URL to host.                                                                                       |

## Architecture

1. `useScanner` owns camera lifecycle, readiness and dimension synchronization, downscaling, frame throttling, viewfinder-to-video mapping, exact worker-request correlation, and periodic full-frame recovery.
2. `scanner.worker.ts` owns protocol validation, monotonic sessions, bounded/coalescing backpressure, frame-quality gating with scheduled recovery, transient-failure tolerance, and serialized decoder requests.
3. `decodeBarcode.ts` is the engine-neutral public-result adapter.
4. `BarcodeDecoder` defines the provider contract.
5. `ZxingWasmDecoder` owns bounded lazy initialization, strict frame/result validation, WASM memory reuse and recovery, options, and terminal cleanup.
6. The generated single-file Emscripten runtime lives under `src/decoders/zxing/generated` with a checksum.
7. `engine/wasm` and `scripts/build-barcode-engine.sh` regenerate those artifacts from locked sources.

The public `ScanResult`, component props, ref methods, and zero-bundler-configuration contract remain unchanged. Camera handling is more defensive, but its public API is unchanged. A compatibility normalizer retains existing names such as `QRCODE`, `CODE128`, `I25`, `UPCA`, `UPCE`, and `ISBN13` even where ZXing-C++ uses different labels or expanded retail-code aliases. Valid two- and five-digit retail supplements are preserved after normalization.

## Build ownership and supply chain

- ZXing-C++ version: `3.1.1`
- ZXing-C++ commit: `287c85df6f961c8efbfb5ffd736cd9457b8b890e`
- Source archive SHA-256: `97d952c661b1f79d21aacc2ec544ef05c4d1465f55692cc49622ea6a8166ca7b`
- Emscripten: `6.0.8`
- Emscripten compiler commit: `aeb67926e7de656da38bc807d83050af93578758`
- Container index digest: `sha256:f174124ff798a3ead1abef247d9a849c270b642d552fea500a42565ff210f765`
- Reproducible build platform: `linux/amd64`
- Platform image digest: `sha256:8714ed3a9fb585e662c931259a996bac36a57a8dd34b81e8277436fd77364475`
- Optimization: reader-only `-O3` with CMake interprocedural/ThinLTO optimization
- Writers and filesystem support: disabled
- C++ exception catches: enabled only on the JavaScript boundary wrapper so raw Emscripten exception pointers never reach consumers
- WebAssembly memory: grows when necessary; one single-byte luminance input allocation is reused
- Generated-runtime API: restricted to `printErr`; Emscripten's license banner is retained in the single-file artifact
- Runtime environments: browser main threads and workers; scanner decoding runs in a worker

Regenerate and verify:

```bash
npm run engine:build
npm run engine:verify
```

The build permits HTTPS redirects only, uses bounded retries and timeouts, verifies the exact source archive before extracting the required reader source, and runs a platform- and digest-pinned toolchain. `engine:verify` then cross-checks the build constants, source and compiler commits, image digests, native ABI safety markers, retail-supplement and damaged-result policies, interprocedural optimization, minimized generated API, embedded license marker, generated TypeScript declaration, artifact manifest, and SBOM checksum. Dependency information is recorded in `engine/wasm/source-lock.json` and `engine/wasm/sbom.spdx.json`. License details are in `THIRD_PARTY_NOTICES.md`, `licenses/ZXING-CPP-APACHE-2.0.txt`, and `licenses/EMSCRIPTEN-MIT-NCSA.txt`.

Version freshness was rechecked on 2026-08-23. ZXing-C++ 3.1.1 and Emscripten 6.0.8 were the current stable upstream releases, the locked direct npm dependency set was current, `npm outdated` returned no packages, `npm ls --depth=0` was clean, registry-signature verification reported no invalid or missing signatures, and `npm audit` reported no known vulnerabilities.

Both CI and the npm publish job rebuild the engine and require a byte-for-byte clean generated diff before continuing. This prevents a release from using an artifact that does not correspond to the reviewed binding, locked ZXing source, and compiler image.

## Runtime safety contract

- Direct decoder RGBA frames must use a live `Uint8ClampedArray`, positive integer dimensions, an exact four-bytes-per-pixel length, and no more than 32 megapixels. The wrapper repeats the live-buffer check after asynchronous initialization so a transferred or detached input cannot decode stale WASM memory. The camera worker applies the tighter capture envelope of at most 1280 px per dimension and 1280² pixels before a frame can reach that decoder boundary.
- The ABI receives the luminance byte length separately from its dimensions. It validates the pointer, exact pixel count, 65,535-pixel per-dimension bound, 32-megapixel cap, and current WASM heap range before constructing ZXing's checked image view.
- Decoded payloads use ZXing's plain-text mode, preserving Unicode plus NUL and GS control characters instead of converting them to display-oriented HRI markers.
- Damaged, partial, checksum-invalid, and format-invalid camera symbols are recoverable misses. ZXing error results are excluded at the native boundary. Configuration failures remain descriptive errors; allocation failures and trapped or malformed modules are discarded and retried once with a fresh instance.
- Decoder disposal is terminal even while initialization is pending. Worker messages and responses are structurally validated and correlated by scanner, monotonic session, and exact request ID. The shared worker tracks at most 16 scanners, rejects only an overflow request when every slot is pending, enters the WASM decoder serially, and retains at most one queued frame per scanner. A newer request removes the superseded queued transfer immediately instead of retaining an unbounded promise chain.
- Low-quality focused frames normally avoid WASM work, but every third focused attempt runs the enhanced decoder regardless of the aggregate score. This bounds recovery latency for a small valid barcode on a bright or glare-heavy phone display. The periodic full-frame pass remains ungated.
- WASM initialization has a 10-second deadline. A separate 15-second main-thread response watchdog can terminate a worker that is synchronously stuck and recreate it for a later start.

## Format coverage

The build supports the previous ZBar set:

- QR Code
- Code 39, Code 93, Code 128, Codabar
- EAN-2/5/8/13, UPC-A/E, ISBN, including valid 2- and 5-digit add-on supplements
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

- real independently generated QR, Code 128, Code 39/93, Codabar, EAN-8/13, UPC-A/E, ISBN, ITF/ITF-14, GS1 DataBar Omni/Limited/Expanded, Data Matrix, PDF417/MicroPDF417, Aztec, MaxiCode, Telepen, Code 32, Micro QR, and rMQR images, including EAN/UPC/ISBN two- and five-digit add-ons;
- rotated, inverted, noisy, glare-obscured, and aggressively damaged input; explicit format filtering; blank negative frames; Unicode and payload control characters; invalid dimensions; malformed or detached buffers; native heap-boundary violations; bounded format filters; and the exact 32-megapixel safety boundary;
- lazy initialization with a deadline, transient initialization retry, fatal-module reconstruction, terminal disposal, WASM allocation reuse/growth/cleanup, strict engine-result validation, and error precedence;
- validated worker envelopes, the 1280 px/1280² camera-frame boundary, exact request correlation, monotonic session ordering, 100-request same-scanner coalescing, 16-scanner capacity behavior, immediate stale queued-job removal, worker recreation/watchdogs, error propagation, and serialized decoder jobs;
- motion, blur, contrast, exposure, and glare scoring against synthetic edge cases and real QR fixtures, including sampling-grid alias resistance and recovery of a small code on a bright phone-display frame by the third focused attempt;
- `object-fit: cover` viewfinder mapping, four focused captures per periodic full-frame recovery capture, every-third enhanced focused recovery, and isolated decode-failure recovery;
- all existing component, accessibility, camera cleanup, multi-instance, session, stale-result, sound, and utility regressions;
- deterministic desktop, portrait, compact, narrow-landscape, and short-landscape layouts, including component-sized hosts, 125–200% text sizing, dark mode, reduced motion, forced colors, hostile strings, ultra-short dialogs, focus containment, black/white accent extremes, rendered corner pixels, and overlay collision checks;
- manual visual review of idle, starting, active, result, and recoverable-error states at nine desktop, tablet, portrait-mobile, and short-landscape viewports, with additional 320 × 360, 568 × 320, DPR 1/2/3, 250–480 px embed, and enlarged-text stress passes;
- the self-contained Blob worker and transferable frame buffer in Chromium, Firefox, and WebKit;
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

### Verification snapshot (2026-08-20)

| Gate                        | Verified result                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration tests  | 18 files and 176/176 tests passed in both default and serialized modes, including native-ABI boundaries, the real-image corpus, frame quality, worker recovery, camera lifecycle, and UI regressions.                                             |
| Browser matrix              | 33 scheduled across the selected projects: 31 passed, with two WebKit forced-colors assertions skipped as expected because that emulation is Chromium-specific. The run includes inline-worker/layout coverage and the Chromium fake-camera path. |
| Responsive visual audit     | 45 base state/layout combinations plus enlarged-text, DPR, ultra-short, embedded-host, hostile-content, theme-extreme, and rendered-pixel stress passes. A follow-up 320 × 360/200% paint check found 0 critical/1 major/0 minor issues.          |
| Dependency audit            | Direct dependencies current; clean top-level tree and registry signatures; 0 known vulnerabilities.                                                                                                                                               |
| Engine reproducibility      | A clean fixed-platform Emscripten 6.0.8 build produced SHA-256 `523ad104cfe8e1129cfe503f99f5b58c1070bec1be0d9bdb7960c015545e7413`; the generated artifact is 988,087 bytes.                                                                       |
| Production bundle           | ESM 1,352.09 kB raw / 464.50 kB gzip; CJS 1,327.32 kB raw / 461.33 kB gzip; CSS 11.12 kB raw / 2.49 kB gzip.                                                                                                                                      |
| Package dry run             | 60 files; approximately 1.01 MB tarball / 2.97 MB unpacked; no bundled npm dependencies.                                                                                                                                                          |
| Local warm decode benchmark | Warm 392×392 QR: focused mean 1.0571 ms (945.96 scans/s); enhanced mean 1.2405 ms (806.10 scans/s). The focused path was 1.17× faster.                                                                                                            |

The Firefox Playwright project remains part of the repository and CI browser matrix. On the 2026-08-19 local macOS verification host, the bundled Firefox runtime stalled before application code executed; Chromium and WebKit completed the corresponding UI and worker assertions, and Chromium completed the fake-camera path. The Firefox attempt produced no application assertion failure, so this is recorded as a local host/runtime limitation while CI retains the project.

The complete responsive findings and maintained visual reference are in [DESIGN_AUDIT.md](./DESIGN_AUDIT.md).

The timing sample was collected on an Apple Silicon development machine and is a regression reference, not a device-wide performance guarantee. Browser, Android, and iOS performance varies with hardware, camera resolution, thermal state, and barcode quality.

## Browser support

The decoder requires WebAssembly, Web Workers, typed arrays, and Blob URLs; live scanning additionally requires `mediaDevices.getUserMedia`, a video element, and Canvas 2D. This covers current Chromium browsers (including Edge and Android), Firefox, and Safari/WebKit (including iOS). Camera access still requires HTTPS or localhost and user permission. Embedded scanners also require iframe camera delegation and a compatible `Permissions-Policy` header.

A restrictive Content Security Policy must permit the self-contained Blob worker, normally with `worker-src 'self' blob:`. Depending on browser and policy version, WebAssembly compilation may also require `script-src 'wasm-unsafe-eval'` or the broader legacy fallback `'unsafe-eval'`; use the narrower directive where supported and verify the actual browser matrix. The engine does not require cross-origin isolation, threads, SIMD, a filesystem, JavaScript `eval`, or a network fetch for its embedded Wasm binary.

`BarcodeDetector` is intentionally not required. It remains a possible opt-in fast path after checking format availability, but inconsistent browser and format coverage make it unsuitable as the only decoder.

## Smart enhancements and roadmap

The provider boundary supports incremental enhancements without changing the component API:

Six smart enhancements are active:

1. Two low-latency focused attempts are followed by a deeper rotate/invert/downscale attempt. The enhanced attempt still runs when aggregate quality is low, preventing bright phone displays from being rejected indefinitely.
2. A bounded stratified luminance sampler scores motion, blur, contrast, exposure, and glare in the worker without fixed-grid aliasing. Low-value focused frames skip WASM on the intervening attempts, while periodic full-frame recovery is never quality-gated or unnecessarily scored.
3. The visible viewfinder is mapped through centered `object-fit: cover` into source-camera pixels. Four smaller focused passes are followed by one complete, deeper frame pass so off-center and difficult barcodes still recover.
4. Video readiness and source dimensions are re-evaluated during scanning, so camera switches, orientation changes, and adaptive camera-resolution changes cannot leave stale canvas or region geometry.
5. Exact request IDs, response deadlines, worker recreation, bounded capture failures, and ended-track handling prevent a lost frame or failed runtime from leaving the scanner silently busy.
6. The shared worker serializes WASM access, caps tracked scanners, and coalesces each scanner's queued work to its newest request, bounding retained transfer memory during cold starts or slow decodes.

The custom `useScanner` view must retain centered `object-fit: cover` on its video element for viewfinder mapping to match the packaged component. If a custom layout uses another `object-position`, omit the viewfinder ref to use full-frame scanning or map the guide through the same centered crop contract.

Further work can build on that scheduler:

1. Send format hints from application configuration to reduce work when the barcode family is known.
2. Track recent candidate positions for region-of-interest rescans without storing decoded payloads.
3. Experiment with `VideoFrame`/WebCodecs and WebGPU preprocessing behind capability checks while preserving the RGBA fallback.
4. Add multi-symbol results through a versioned opt-in API after the single-result compatibility path remains stable.
5. Maintain a growing licensed device/camera corpus and record p50/p95 cold and warm decode metrics in CI or a dedicated benchmark lab.

## Rollback

The implementation is isolated behind `BarcodeDecoder`. If a release-blocking regression is discovered, a temporary provider can be substituted without changing camera or React APIs. Reintroducing the old npm package is not the preferred rollback because it restores the aging toolchain and LGPL artifact; use a pinned comparison provider only long enough to diagnose a parity gap.
