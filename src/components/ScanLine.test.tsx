import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import ScanLine from "./ScanLine";

describe("ScanLine", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(<ScanLine visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the animated scan line and its trails when visible", () => {
    const { container } = render(<ScanLine visible />);
    expect(container.querySelector(".mbs-scan-line-container")).not.toBeNull();
    expect(container.querySelector(".mbs-scan-line")).not.toBeNull();
    expect(container.querySelector(".mbs-scan-line-trail-down")).not.toBeNull();
    expect(container.querySelector(".mbs-scan-line-trail-up")).not.toBeNull();
  });
});
