# Third-party notices

Modern Barcode Scanner is MIT-licensed. Its first-party WebAssembly barcode engine links a pinned reader-only build of [ZXing-C++ 3.1.1](https://github.com/zxing-cpp/zxing-cpp/tree/v3.1.1), licensed under the Apache License 2.0.

The exact source is pinned to commit `287c85df6f961c8efbfb5ffd736cd9457b8b890e`. Its source archive SHA-256 is `97d952c661b1f79d21aacc2ec544ef05c4d1465f55692cc49622ea6a8166ca7b`.

The binding source, compiler lock, reproducible build, generated-artifact checksums, and SPDX SBOM are maintained in this repository under `engine/wasm`, `scripts`, and `src/decoders/zxing/generated`. The full third-party license is shipped at `licenses/ZXING-CPP-APACHE-2.0.txt`.

The previous `@undecaf/zbar-wasm` runtime and its LGPL-2.1+ artifact are no longer included.

No endorsement by the upstream authors is implied. Review the applicable license obligations for your distribution model.
