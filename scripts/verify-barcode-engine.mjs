#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  binding: join(repositoryRoot, "engine/wasm/BarcodeReader.cpp"),
  buildScript: join(repositoryRoot, "scripts/build-barcode-engine.sh"),
  cmake: join(repositoryRoot, "engine/wasm/CMakeLists.txt"),
  declaration: join(repositoryRoot, "src/decoders/zxing/generated/mbs-barcode-reader.d.ts"),
  manifest: join(repositoryRoot, "src/decoders/zxing/generated/artifacts.sha256"),
  sbom: join(repositoryRoot, "engine/wasm/sbom.spdx.json"),
  sourceLock: join(repositoryRoot, "engine/wasm/source-lock.json"),
};

const failures = [];
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const expectEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
};
const expectMatch = (label, value, pattern) => {
  if (!pattern.test(value)) failures.push(`${label}: required contract marker is missing`);
};

const buildScript = readFileSync(paths.buildScript, "utf8");
const binding = readFileSync(paths.binding, "utf8");
const cmake = readFileSync(paths.cmake, "utf8");
const declaration = readFileSync(paths.declaration, "utf8");
const sourceLock = JSON.parse(readFileSync(paths.sourceLock, "utf8"));
const sbom = JSON.parse(readFileSync(paths.sbom, "utf8"));

const readBuildConstant = (name) => {
  const value = buildScript.match(new RegExp(`readonly ${name}="([^"]+)"`))?.[1];
  if (!value) failures.push(`build script constant ${name}: missing`);
  return value;
};

const zxingCommit = readBuildConstant("ZXING_COMMIT");
const zxingSourceSha256 = readBuildConstant("ZXING_SOURCE_SHA256");
const emscriptenPlatform = readBuildConstant("EMSCRIPTEN_PLATFORM");
const emscriptenImage = readBuildConstant("EMSCRIPTEN_IMAGE");
const emscriptenVersion = emscriptenImage?.match(/\/emsdk:([^@]+)@/)?.[1];

expectEqual("source lock commit", sourceLock.commit, zxingCommit);
expectEqual("source lock source SHA-256", sourceLock.sourceSha256, zxingSourceSha256);
expectEqual(
  "source lock source URL",
  sourceLock.sourceUrl,
  `https://codeload.github.com/zxing-cpp/zxing-cpp/tar.gz/${zxingCommit}`,
);
expectEqual("source lock platform", sourceLock.toolchain?.platform, emscriptenPlatform);
expectEqual("source lock toolchain version", sourceLock.toolchain?.version, emscriptenVersion);
expectEqual(
  "source lock container image",
  `${sourceLock.toolchain?.container}@${sourceLock.toolchain?.containerDigest}`,
  emscriptenImage,
);
expectEqual(
  "source lock binding input SHA-256",
  sourceLock.inputs?.bindingSha256,
  sha256File(paths.binding),
);
expectEqual(
  "source lock CMake input SHA-256",
  sourceLock.inputs?.cmakeSha256,
  sha256File(paths.cmake),
);
expectEqual(
  "source lock build script SHA-256",
  sourceLock.inputs?.buildScriptSha256,
  sha256File(paths.buildScript),
);

const manifestLines = readFileSync(paths.manifest, "utf8").trim().split(/\r?\n/);
if (manifestLines.length !== 1) failures.push("artifact manifest must contain exactly one entry");
const manifestMatch = manifestLines[0]?.match(/^([a-f0-9]{64})  (.+)$/);
if (!manifestMatch) failures.push("artifact manifest must use lowercase SHA-256 shasum syntax");

const artifactRelativePath = sourceLock.artifact?.path;
expectEqual(
  "source lock artifact path",
  artifactRelativePath,
  "src/decoders/zxing/generated/mbs-barcode-reader.js",
);
const artifactPath = artifactRelativePath && join(repositoryRoot, artifactRelativePath);
const artifactSha256 = artifactPath && sha256File(artifactPath);
const artifact = artifactPath ? readFileSync(artifactPath, "utf8") : "";
expectEqual("artifact manifest filename", manifestMatch?.[2], "mbs-barcode-reader.js");
expectEqual("artifact manifest SHA-256", manifestMatch?.[1], artifactSha256);
expectEqual("source lock artifact SHA-256", sourceLock.artifact?.sha256, artifactSha256);

const zxingPackage = sbom.packages?.find((entry) => entry.name === "ZXing-C++");
const bindingPackage = sbom.packages?.find(
  (entry) => entry.name === "modern-barcode-engine-binding",
);
const emscriptenPackage = sbom.packages?.find((entry) => entry.name === "Emscripten");
expectEqual("SBOM ZXing version", zxingPackage?.versionInfo, sourceLock.version);
expectEqual("SBOM ZXing source URL", zxingPackage?.downloadLocation, sourceLock.sourceUrl);
expectEqual("SBOM ZXing SHA-256", zxingPackage?.checksums?.[0]?.checksumValue, zxingSourceSha256);
expectEqual("SBOM ZXing license", zxingPackage?.licenseDeclared, sourceLock.license);
expectEqual("SBOM binding ABI version", bindingPackage?.versionInfo, "2");
expectEqual("SBOM binding checksum algorithm", bindingPackage?.checksums?.[0]?.algorithm, "SHA256");
expectEqual(
  "SBOM binding artifact SHA-256",
  bindingPackage?.checksums?.[0]?.checksumValue,
  artifactSha256,
);
expectEqual("SBOM ZXing checksum algorithm", zxingPackage?.checksums?.[0]?.algorithm, "SHA256");
expectEqual("SBOM Emscripten version", emscriptenPackage?.versionInfo, emscriptenVersion);
expectEqual(
  "SBOM Emscripten source",
  emscriptenPackage?.downloadLocation,
  `https://github.com/emscripten-core/emscripten/tree/${sourceLock.toolchain?.upstreamCommit}`,
);
expectEqual("SBOM Emscripten license", emscriptenPackage?.licenseDeclared, "MIT OR NCSA");
expectEqual(
  "SBOM Emscripten checksum algorithm",
  emscriptenPackage?.checksums?.[0]?.algorithm,
  "SHA1",
);
expectEqual(
  "SBOM Emscripten source checksum",
  emscriptenPackage?.checksums?.[0]?.checksumValue,
  sourceLock.toolchain?.upstreamCommit,
);

expectMatch(
  "source lock Emscripten commit",
  sourceLock.toolchain?.upstreamCommit ?? "",
  /^[a-f0-9]{40}$/,
);
expectMatch(
  "source lock container digest",
  sourceLock.toolchain?.containerDigest ?? "",
  /^sha256:[a-f0-9]{64}$/,
);
expectMatch(
  "source lock container index digest",
  sourceLock.toolchain?.containerIndexDigest ?? "",
  /^sha256:[a-f0-9]{64}$/,
);

expectMatch(
  "generated declaration ABI",
  declaration,
  /readBarcodeFromLuminance\(\s*bufferPointer: number,\s*bufferByteLength: number,\s*width: number,/,
);
expectMatch("native byte-length ABI", binding, /uint32_t bufferByteLength/);
expectMatch("native heap-range validation", binding, /emscripten_get_heap_size\(\)/);
expectMatch("native payload text mode", binding, /textMode\(ZXing::TextMode::Plain\)/);
expectMatch(
  "native retail supplement policy",
  binding,
  /eanAddOnSymbol\(ZXing::EanAddOnSymbol::Read\)/,
);
expectMatch("native damaged-result exclusion", binding, /returnErrors\(false\)/);
expectMatch("native damaged-symbol recovery", binding, /if \(barcode\.error\(\)\)\s*return \{\};/);
expectMatch("native ZXing error recovery", binding, /catch \(const ZXing::Error&\)/);
expectMatch("native allocation propagation", binding, /catch \(const std::bad_alloc&\)/);
expectMatch("ThinLTO engine optimization", cmake, /set\(CMAKE_INTERPROCEDURAL_OPTIMIZATION ON\)/);
expectMatch("minimized module API", cmake, /-sINCOMING_MODULE_JS_API=printErr/);
expectMatch("embedded Emscripten license", cmake, /-sEMIT_EMSCRIPTEN_LICENSE=1/);
expectMatch(
  "generated Emscripten license marker",
  artifact,
  /@license[\s\S]{0,160}SPDX-License-Identifier: MIT/,
);

if (failures.length) {
  throw new Error(`Barcode engine verification failed:\n- ${failures.join("\n- ")}`);
}

console.log(`Verified barcode engine ABI 2 (${artifactSha256})`);
