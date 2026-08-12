cmake_minimum_required(VERSION 3.20)

project(ModernBarcodeEngine LANGUAGES CXX)

if(NOT DEFINED ZXING_CPP_SOURCE)
  message(FATAL_ERROR "ZXING_CPP_SOURCE must point to the pinned zxing-cpp source tree")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)

set(ZXING_READERS ON CACHE BOOL "Build barcode readers" FORCE)
set(ZXING_WRITERS OFF CACHE STRING "Do not build barcode writers" FORCE)
set(ZXING_C_API OFF CACHE BOOL "Do not build the C API" FORCE)
set(ZXING_USE_BUNDLED_ZINT OFF CACHE BOOL "Writers are disabled" FORCE)

add_subdirectory("${ZXING_CPP_SOURCE}/core" "${CMAKE_BINARY_DIR}/zxing-core")

add_executable(mbs-barcode-reader BarcodeReader.cpp)
target_link_libraries(mbs-barcode-reader PRIVATE ZXing::ZXing)
target_compile_options(mbs-barcode-reader PRIVATE -O3)
target_link_options(
  mbs-barcode-reader
  PRIVATE
    --bind
    --no-entry
    -O3
    "-sASSERTIONS=0"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sDISABLE_EXCEPTION_CATCHING=0"
    "-sDYNAMIC_EXECUTION=0"
    "-sENVIRONMENT=web,worker"
    "-sEXPORTED_FUNCTIONS=_malloc,_free"
    "-sEXPORTED_RUNTIME_METHODS=HEAPU8"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=createModernBarcodeModule"
    "-sFILESYSTEM=0"
    "-sMALLOC=emmalloc"
    "-sMODULARIZE=1"
    "-sNO_EXIT_RUNTIME=1"
    "-sSINGLE_FILE=1"
)
set_target_properties(mbs-barcode-reader PROPERTIES SUFFIX ".js")
