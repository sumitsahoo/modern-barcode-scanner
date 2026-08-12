# Decoder migration plan

## Decision

Do not write a clean-room multi-format barcode decoder inside the React library. Barcode detection is the reliability-critical part of the product, and a new decoder without a large conformance corpus would create false positives, missed scans, and security risk.

Instead, own the integration, build, tests, and release artifact while using a proven decoding engine. The recommended target is a pinned, reader-only [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) WebAssembly build produced by this repository. ZXing-C++ is Apache-2.0 licensed, supports WebAssembly, and covers the current formats plus PDF417, Data Matrix, and Aztec. Native `BarcodeDetector` can be a progressive fast path, but it cannot be the only implementation because browser and format support vary.

## Current state

- `@undecaf/zbar-wasm` 0.11.0 is the latest published upstream version; the application is not behind an available release.
- The release is dated May 2024 and the repository's latest commit is from July 2024, so owning the upgrade path is still justified.
- The inlined ZBar artifact is approximately 236 KiB before JavaScript/base64 overhead and is LGPL-2.1+.
- ZBar does not provide the PDF417 coverage previously claimed by this project's README. The public format list now matches the decoder's documented capabilities.
- `src/decoders/decodeBarcode.ts` is the engine boundary. Camera, worker, and public component code no longer depend directly on a ZBar-shaped result.

## Target architecture

1. `useScanner` captures and sizes frames but remains decoder-agnostic.
2. The dedicated worker owns decoder initialization and one in-flight request per scanner session.
3. A small provider contract accepts `ImageData` and returns normalized `ScanResult` values.
4. The default provider loads a repository-built, content-hashed WASM artifact.
5. An optional native provider uses `BarcodeDetector` only after checking `getSupportedFormats()` for the requested formats.
6. The worker falls back to WASM on unsupported browsers, unsupported formats, initialization errors, or native decode failure.

## Delivery stages

### 1. Establish parity gates

- Add licensed positive and negative image fixtures for every documented format.
- Cover rotation, mirrored input, low contrast, blur, glare, partial framing, and multiple-code frames.
- Record current cold-start time, warm p50/p95 decode time, memory high-water mark, and compressed package size on representative desktop, Android, and iOS browsers.
- Add fuzz tests for malformed pixel buffers and decoder initialization failures.

### 2. Build the first-party artifact

- Pin ZXing-C++ and Emscripten by immutable version and source hash.
- Compile a reader-only build with writers, exceptions, filesystem support, and unused formats disabled where possible.
- Keep the source lock, build container, compiler flags, checksums, SBOM, license, and reproducibility instructions in the repository.
- Expose only allocation, decode, result-copy, and cleanup functions through a minimal C ABI.

### 3. Integrate behind the provider boundary

- Add the new provider without changing `ScanResult` or component props.
- Keep the current provider available behind a development-only comparison flag.
- Run both engines against the same fixture corpus and compare normalized outputs.
- Preserve session IDs, scanner IDs, backpressure, and transferable frame buffers.

### 4. Validate before switching

The replacement is eligible to become the default only when:

- every documented format passes the positive/negative corpus with no unexplained parity regression;
- p95 warm decode latency is no worse than the current engine on the reference device set, or a measured trade-off is explicitly accepted;
- compressed package size stays within 10% of the current package unless broader format support justifies and documents the increase;
- repeated start/stop, camera switching, multiple component instances, worker crashes, and stale responses pass automated tests;
- Chrome, Edge, Firefox, and Safari pass desktop and mobile smoke tests;
- accessibility, license notices, source availability, SBOM, and security review are complete.

### 5. Remove the npm dependency

- Delete `@undecaf/zbar-wasm`, the `zbar-inlined` resolver condition, and ZBar-specific keywords/comments.
- Remove the comparison provider after one stable release.
- Update the format matrix, bundle-size guidance, third-party notices, and migration notes.

## Explicit non-goals

- Do not vendor the existing npm output and call it a custom implementation. That removes package-manager visibility without improving maintenance or LGPL obligations.
- Do not depend exclusively on the native `BarcodeDetector` API.
- Do not expand the public component API until the provider comparison proves a consumer-facing option is necessary.
