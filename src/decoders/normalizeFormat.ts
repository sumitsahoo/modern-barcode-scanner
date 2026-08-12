const LEGACY_FORMAT_NAMES: Readonly<Record<string, string>> = {
  aztec: "AZTEC",
  azteccode: "AZTEC",
  aztecrune: "AZTECRUNE",
  codabar: "CODABAR",
  code32: "CODE32",
  code39: "CODE39",
  code39extended: "CODE39",
  code39standard: "CODE39",
  code93: "CODE93",
  code128: "CODE128",
  compactpdf417: "PDF417",
  databar: "DATABAR",
  databarexpanded: "DATABAR_EXP",
  databarexpandedstacked: "DATABAR_EXP",
  databarlimited: "DATABAR_LTD",
  databaromni: "DATABAR",
  databarstacked: "DATABAR",
  databarstackedomni: "DATABAR",
  datamatrix: "DATAMATRIX",
  dxfilmedge: "DXFILMEDGE",
  ean2: "EAN2",
  ean5: "EAN5",
  ean8: "EAN8",
  ean13: "EAN13",
  isbn: "ISBN13",
  itf: "I25",
  itf14: "I25",
  maxicode: "MAXICODE",
  micropdf417: "PDF417",
  microqrcode: "QRCODE",
  pdf417: "PDF417",
  qrcode: "QRCODE",
  qrcodemodel1: "QRCODE",
  qrcodemodel2: "QRCODE",
  rmqrcode: "QRCODE",
  telepen: "TELEPEN",
  telepenalpha: "TELEPEN",
  telepennumeric: "TELEPEN",
  upca: "UPCA",
  upce: "UPCE",
};

/** Preserve the ZBar-shaped names already returned by the public API. */
export const normalizeFormatName = (format: string): string => {
  const compactName = format.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return LEGACY_FORMAT_NAMES[compactName] ?? compactName.toUpperCase();
};

export interface NormalizedBarcode {
  typeName: string;
  scanData: string;
}

const compactUpce = (text: string): string | undefined => {
  // ZXing-C++ 3.x reports UPC-E as its standards-equivalent 13-digit EAN.
  // Convert compressible values back to the eight digits returned by ZBar so
  // the public API remains compatible with earlier scanner releases.
  if (!/^0\d{12}$/.test(text)) return undefined;

  const upca = text.slice(1);
  const numberSystem = upca[0];
  const manufacturer = upca.slice(1, 6);
  const product = upca.slice(6, 11);
  const checkDigit = upca[11];

  if (numberSystem !== "0" && numberSystem !== "1") return undefined;

  if (
    manufacturer.slice(3) === "00" &&
    /^[012]$/.test(manufacturer[2]) &&
    product.startsWith("00")
  ) {
    return `${numberSystem}${manufacturer.slice(0, 2)}${product.slice(2)}${manufacturer[2]}${checkDigit}`;
  }
  if (manufacturer.slice(3) === "00" && product.startsWith("000")) {
    return `${numberSystem}${manufacturer.slice(0, 3)}${product.slice(3)}3${checkDigit}`;
  }
  if (manufacturer.endsWith("0") && product.startsWith("0000")) {
    return `${numberSystem}${manufacturer.slice(0, 4)}${product[4]}4${checkDigit}`;
  }
  if (product.startsWith("0000") && /^[5-9]$/.test(product[4])) {
    return `${numberSystem}${manufacturer}${product[4]}${checkDigit}`;
  }

  return undefined;
};

/** Normalize engine-specific aliases and retail-code representations. */
export const normalizeDecodedBarcode = (format: string, text: string): NormalizedBarcode => {
  const typeName = normalizeFormatName(format);

  if (typeName === "UPCE") {
    return { typeName, scanData: compactUpce(text) ?? text };
  }

  // ZXing-C++ represents UPC-A as its equivalent EAN-13 value with a leading
  // zero when both readers are enabled. ZBar returned UPC-A and 12 digits.
  if (typeName === "EAN13" && /^0\d{12}$/.test(text)) {
    return { typeName: "UPCA", scanData: text.slice(1) };
  }

  // Bookland EAN values are ISBN-13 barcodes. Preserve the existing library's
  // ISBN type rather than exposing an engine-specific EAN alias.
  if (typeName === "EAN13" && /^(?:978|979)\d{10}$/.test(text)) {
    return { typeName: "ISBN13", scanData: text };
  }

  return { typeName, scanData: text };
};
