import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import {
  IconAlert,
  IconAdjustments,
  IconCamera,
  IconCameraOff,
  IconCameraPlaceholder,
  IconCheck,
  IconRotateCamera,
  IconScanFrame,
  IconTorchOff,
  IconTorchOn,
} from "./Icons";

const icons = [
  ["alert", IconAlert],
  ["camera", IconCamera],
  ["camera off", IconCameraOff],
  ["camera placeholder", IconCameraPlaceholder],
  ["rotate camera", IconRotateCamera],
  ["torch on", IconTorchOn],
  ["torch off", IconTorchOff],
  ["scan frame", IconScanFrame],
  ["check", IconCheck],
  ["adjustments", IconAdjustments],
] as const;

describe("scanner icons", () => {
  it.each(icons)("renders the %s icon on the shared visual grid", (_, Icon) => {
    const { container } = render(<Icon className="icon-under-test" data-icon="scanner" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.75");
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveClass("icon-under-test");
    expect(svg).toHaveAttribute("data-icon", "scanner");
    expect(svg).not.toHaveAttribute("width");
    expect(svg).not.toHaveAttribute("height");
  });

  it("uses a dedicated ready-state symbol instead of the camera-off glyph", () => {
    expect(IconCameraPlaceholder).not.toBe(IconCameraOff);
  });

  it("uses the canonical scanner logo for the ready-state placeholder", () => {
    expect(IconCameraPlaceholder).toBe(IconScanFrame);
  });
});
