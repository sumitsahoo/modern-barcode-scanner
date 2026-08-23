# Third-party notices

Modern Barcode Scanner is MIT-licensed. Its first-party WebAssembly barcode engine links a pinned reader-only build of [ZXing-C++ 3.1.1](https://github.com/zxing-cpp/zxing-cpp/tree/v3.1.1), licensed under the Apache License 2.0. The generated JavaScript and WebAssembly runtime is built with [Emscripten 6.0.8](https://github.com/emscripten-core/emscripten/tree/6.0.8), available under the MIT or University of Illinois/NCSA Open Source License.

The exact source is pinned to commit `287c85df6f961c8efbfb5ffd736cd9457b8b890e`. Its source archive SHA-256 is `97d952c661b1f79d21aacc2ec544ef05c4d1465f55692cc49622ea6a8166ca7b`.

The Emscripten compiler source is pinned to commit `aeb67926e7de656da38bc807d83050af93578758`, and the build retains Emscripten's license banner in the generated single-file runtime.

The binding source, compiler lock, reproducible build, generated-artifact checksums, and SPDX SBOM are maintained in this repository under `engine/wasm`, `scripts`, and `src/decoders/zxing/generated`. The complete third-party license texts are shipped at `licenses/ZXING-CPP-APACHE-2.0.txt` and `licenses/EMSCRIPTEN-MIT-NCSA.txt`.

The previous `@undecaf/zbar-wasm` runtime and its LGPL-2.1+ artifact are no longer included.

No endorsement by the upstream authors is implied. Review the applicable license obligations for your distribution model.
