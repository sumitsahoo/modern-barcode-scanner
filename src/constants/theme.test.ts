import { describe, expect, it } from "vite-plus/test";
import { SCANNER_THEME } from "./theme";

describe("SCANNER_THEME", () => {
  it("uses Ocean Blue (#2563EB) as the primary color", () => {
    expect(SCANNER_THEME.primary.toLowerCase()).toBe("#2563eb");
  });

  it("uses a darker shade of Ocean Blue for the dark variant", () => {
    expect(SCANNER_THEME.primaryDark.toLowerCase()).toBe("#1d4ed8");
  });
});
