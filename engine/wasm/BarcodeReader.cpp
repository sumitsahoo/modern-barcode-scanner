// Copyright 2026 Modern Barcode Scanner contributors
// SPDX-License-Identifier: MIT
//
// This minimal WebAssembly binding links against ZXing-C++ (Apache-2.0).

#include "BarcodeFormat.h"
#include "ReadBarcode.h"
#include "ZXAlgorithms.h"

#include <emscripten/bind.h>

#include <cstdint>
#include <exception>
#include <string>

namespace {

struct ReadResult
{
	std::string format{};
	std::string text{};
	std::string error{};
	ZXing::Position position{};
	std::string symbologyIdentifier{};
};

ReadResult ReadBarcodeFromLuminance(
	uintptr_t bufferPointer, int width, int height, bool tryHarder, const std::string& formats)
{
	if (bufferPointer == 0 || width <= 0 || height <= 0)
		return {{}, {}, "Invalid luminance image buffer"};

	try {
		auto options = ZXing::ReaderOptions()
			.formats(ZXing::BarcodeFormatsFromString(formats))
			.tryHarder(tryHarder)
			.tryRotate(tryHarder)
			.tryInvert(tryHarder)
			.tryDownscale(tryHarder)
			.maxNumberOfSymbols(1);

		auto barcodes = ZXing::ReadBarcodes(
			{reinterpret_cast<const uint8_t*>(bufferPointer), width, height, ZXing::ImageFormat::Lum}, options);
		if (barcodes.empty())
			return {};

		const auto& barcode = barcodes.front();
		return {
			ZXing::ToString(barcode.format()),
			barcode.text(),
			ZXing::ToString(barcode.error()),
			barcode.position(),
			barcode.symbologyIdentifier(),
		};
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
