#!/usr/bin/env bash

set -euo pipefail

readonly ZXING_COMMIT="287c85df6f961c8efbfb5ffd736cd9457b8b890e"
readonly ZXING_SOURCE_SHA256="97d952c661b1f79d21aacc2ec544ef05c4d1465f55692cc49622ea6a8166ca7b"
readonly EMSCRIPTEN_PLATFORM="linux/amd64"
readonly EMSCRIPTEN_IMAGE="docker.io/emscripten/emsdk:4.0.20@sha256:33e992367f721747d8008c9141c04fa017139e3557a60e0c80be93a0870fe462"

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly GENERATED_DIR="${REPOSITORY_ROOT}/src/decoders/zxing/generated"
readonly BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/modern-barcode-engine.XXXXXX")"

cleanup() {
  rm -rf "${BUILD_ROOT}"
}
trap cleanup EXIT

mkdir -p "${BUILD_ROOT}/source" "${BUILD_ROOT}/build" "${GENERATED_DIR}"

readonly SOURCE_ARCHIVE="${BUILD_ROOT}/zxing-cpp.tar.gz"
readonly SOURCE_ROOT="zxing-cpp-${ZXING_COMMIT}"
curl --fail --location --silent --show-error \
  --proto '=https' \
  --proto-redir '=https' \
  --retry 3 \
  --retry-all-errors \
  --connect-timeout 15 \
  --max-time 120 \
  "https://codeload.github.com/zxing-cpp/zxing-cpp/tar.gz/${ZXING_COMMIT}" \
  --output "${SOURCE_ARCHIVE}"

printf '%s  %s\n' "${ZXING_SOURCE_SHA256}" "${SOURCE_ARCHIVE}" | shasum -a 256 --check
tar -xzf "${SOURCE_ARCHIVE}" \
  --strip-components=1 \
  -C "${BUILD_ROOT}/source" \
  "${SOURCE_ROOT}/core" \
  "${SOURCE_ROOT}/zxing.cmake"

docker run --rm \
  --platform "${EMSCRIPTEN_PLATFORM}" \
  --user "$(id -u):$(id -g)" \
  --volume "${REPOSITORY_ROOT}:/workspace:ro" \
  --volume "${BUILD_ROOT}/source:/zxing-cpp:ro" \
  --volume "${BUILD_ROOT}/build:/build" \
  "${EMSCRIPTEN_IMAGE}" \
  bash -lc \
  'emcmake cmake /workspace/engine/wasm -B /build -DZXING_CPP_SOURCE=/zxing-cpp && cmake --build /build --parallel'

cp "${BUILD_ROOT}/build/mbs-barcode-reader.js" "${GENERATED_DIR}/mbs-barcode-reader.js"
rm -f "${GENERATED_DIR}/mbs-barcode-reader.wasm" "${GENERATED_DIR}/mbs-barcode-reader.wasm.js"
(
  cd "${GENERATED_DIR}"
  shasum -a 256 mbs-barcode-reader.js > artifacts.sha256
)

printf 'Generated %s\n' "${GENERATED_DIR}/mbs-barcode-reader.js"
