// Copyright 2026 Modern Barcode Scanner contributors
// SPDX-License-Identifier: MIT
//
// This minimal WebAssembly binding links against ZXing-C++ (Apache-2.0).

#include "BarcodeFormat.h"
#include "Error.h"
#include "ReadBarcode.h"
#include "ZXAlgorithms.h"

#include <emscripten/bind.h>
#include <emscripten/heap.h>

#include <cstddef>
#include <cstdint>
#include <exception>
#include <new>
#include <stdexcept>
#include <string>

namespace {

constexpr uint64_t MAX_IMAGE_PIXELS = 32ULL * 1024 * 1024;
constexpr int MAX_IMAGE_DIMENSION = 65535;
constexpr size_t MAX_FORMAT_FILTER_BYTES = 1024;

struct ReadResult
{
	std::string format{};
	std::string text{};
	std::string error{};
	ZXing::Position position{};
	std::string symbologyIdentifier{};
};

ReadResult ReadBarcodeFromLuminance(
	uintptr_t bufferPointer, uint32_t bufferByteLength, int width, int height, bool tryHarder,
	const std::string& formats)
{
	if (bufferPointer == 0 || width <= 0 || height <= 0)
		return {{}, {}, "Invalid luminance image buffer"};
	if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION)
		return {{}, {}, "Luminance image dimensions exceed the decoder limit"};

	// Validate with a wide type before calling ZXing. Its checked ImageView
	// overload accepts an int byte count and performs int stride arithmetic.
	const auto pixelCount = static_cast<uint64_t>(width) * static_cast<uint64_t>(height);
	if (pixelCount > MAX_IMAGE_PIXELS)
		return {{}, {}, "Luminance image exceeds the 32-megapixel safety limit"};
	if (pixelCount != bufferByteLength)
		return {{}, {}, "Luminance buffer length does not match image dimensions"};

	const auto heapSize = emscripten_get_heap_size();
	if (bufferPointer > heapSize || bufferByteLength > heapSize - bufferPointer)
		return {{}, {}, "Luminance buffer lies outside WebAssembly memory"};
	if (formats.size() > MAX_FORMAT_FILTER_BYTES)
		return {{}, {}, "Barcode format filter exceeds the safety limit"};

	ZXing::BarcodeFormats requestedFormats;
	try {
		requestedFormats = ZXing::BarcodeFormatsFromString(formats);
	} catch (const std::exception& error) {
		return {{}, {}, error.what()};
	} catch (...) {
		return {{}, {}, "Invalid barcode format filter"};
	}

	try {
		auto options = ZXing::ReaderOptions()
			.formats(requestedFormats)
			.tryHarder(tryHarder)
			.tryRotate(tryHarder)
			.tryInvert(tryHarder)
			.tryDownscale(tryHarder)
			.textMode(ZXing::TextMode::Plain)
			.maxNumberOfSymbols(1);

		auto image = ZXing::ImageView(
			reinterpret_cast<const uint8_t*>(bufferPointer), static_cast<int>(bufferByteLength), width, height,
			ZXing::ImageFormat::Lum);
		auto barcodes = ZXing::ReadBarcodes(image, options);
		if (barcodes.empty())
			return {};

		const auto& barcode = barcodes.front();
		if (barcode.error())
			return {};
		return {
			ZXing::ToString(barcode.format()),
			barcode.text(),
			ZXing::ToString(barcode.error()),
			barcode.position(),
			barcode.symbologyIdentifier(),
		};
	} catch (const ZXing::Error&) {
		return {};
	} catch (const std::invalid_argument&) {
		return {};
	} catch (const std::out_of_range&) {
		// Reader exceptions are content-dependent for camera input (for example,
		// a partial symbol exhausting its bit stream). The buffer and options are
		// already validated above, so these are recoverable misses rather than
		// engine failures.
		return {};
	} catch (const std::bad_alloc&) {
		// Preserve allocation failures so the TypeScript provider can abandon the
		// module, retry once with fresh memory, and classify a repeated failure.
		throw;
	} catch (const std::exception& error) {
		return {{}, {}, error.what()};
	} catch (...) {
		return {{}, {}, "Unknown decoder error"};
	}
}

} // namespace

EMSCRIPTEN_BINDINGS(ModernBarcodeReader)
{
	using namespace emscripten;

	value_object<ZXing::PointI>("Point").field("x", &ZXing::PointI::x).field("y", &ZXing::PointI::y);

	value_object<ZXing::Position>("Position")
		.field("topLeft", emscripten::index<0>())
		.field("topRight", emscripten::index<1>())
		.field("bottomRight", emscripten::index<2>())
		.field("bottomLeft", emscripten::index<3>());

	value_object<ReadResult>("ReadResult")
		.field("format", &ReadResult::format)
		.field("text", &ReadResult::text)
		.field("error", &ReadResult::error)
		.field("position", &ReadResult::position)
		.field("symbologyIdentifier", &ReadResult::symbologyIdentifier);

	function("readBarcodeFromLuminance", &ReadBarcodeFromLuminance);
}
