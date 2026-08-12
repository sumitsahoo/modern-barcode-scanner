import { describe, expect, it } from "vite-plus/test";
import { normalizeDecodedBarcode, normalizeFormatName } from "./normalizeFormat";

describe("normalizeFormatName", () => {
  it.each([
    ["QR Code", "QRCODE"],
    ["Code 128", "CODE128"],
    ["EAN-13", "EAN13"],
    ["UPC-A", "UPCA"],
    ["ITF", "I25"],
    ["DataBar Expanded Stacked", "DATABAR_EXP"],
    ["Data Matrix", "DATAMATRIX"],
    ["PDF417", "PDF417"],
    ["Aztec Code", "AZTEC"],
  ])("maps %s to the stable public name %s", (input, expected) => {
    expect(normalizeFormatName(input)).toBe(expected);
  });

  it("normalizes future engine format names deterministically", () => {
    expect(normalizeFormatName("New Format-42")).toBe("NEWFORMAT42");
  });

  it("preserves UPC-A and ISBN-13 behavior when ZXing reports their EAN equivalents", () => {
    expect(normalizeDecodedBarcode("EAN-13", "0012345678905")).toEqual({
      typeName: "UPCA",
      scanData: "012345678905",
    });
    expect(normalizeDecodedBarcode("EAN-13", "9780306406157")).toEqual({
      typeName: "ISBN13",
      scanData: "9780306406157",
    });
  });

  it.each([
    ["0012000003457", "01234507"],
    ["0012300000457", "01234537"],
    ["0012340000057", "01234547"],
    ["0012345000058", "01234558"],
  ])("compacts the ZXing UPC-E representation %s", (text, expected) => {
    expect(normalizeDecodedBarcode("UPC-E", text)).toEqual({
      typeName: "UPCE",
      scanData: expected,
    });
  });

  it("leaves a non-compressible UPC-E representation intact", () => {
    expect(normalizeDecodedBarcode("UPC-E", "0099999999999")).toEqual({
      typeName: "UPCE",
      scanData: "0099999999999",
    });
  });
});
