import { describe, expect, it } from "vitest";
import { convertToGrayscale, isPhone } from "./barcodeHelpers";

describe("barcodeHelpers", () => {
    describe("isPhone", () => {
        it("returns true for mobile user agents", () => {
            const originalUserAgent = navigator.userAgent;

            // Mock iPhone
            Object.defineProperty(navigator, "userAgent", {
                value: "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3 like Mac OS X)",
                configurable: true,
            });
            expect(isPhone()).toBe(true);

            // Mock Android
            Object.defineProperty(navigator, "userAgent", {
                value: "Mozilla/5.0 (Linux; Android 10; SM-G981B)",
                configurable: true,
            });
            expect(isPhone()).toBe(true);

            // Mock Desktop Windows
            Object.defineProperty(navigator, "userAgent", {
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                configurable: true,
            });
            expect(isPhone()).toBe(false);

            // Restore
            Object.defineProperty(navigator, "userAgent", {
                value: originalUserAgent,
                configurable: true,
            });
        });
    });

    describe("convertToGrayscale", () => {
        it("correctly converts RGBA to grayscale using luminosity method", () => {
            // Mock ImageData (2x2 pixel, 16 elements: Red, Green, Blue, White)
            const data = new Uint8ClampedArray([
                255, 0, 0, 255, // red
                0, 255, 0, 255, // green
                0, 0, 255, 255, // blue
                255, 255, 255, 255, // white
            ]);
            const imageData = { data, width: 2, height: 2 } as ImageData;

            const result = convertToGrayscale(imageData);

            // Red (255 * 77 >> 8 = 76.6 -> truncated to 76)
            expect(result.data[0]).toBe(76);
            expect(result.data[1]).toBe(76);
            expect(result.data[2]).toBe(76);
            expect(result.data[3]).toBe(255); // Alpha unchanged

            // Green (255 * 150 >> 8 = 149)
            expect(result.data[4]).toBe(149);
            expect(result.data[5]).toBe(149);
            expect(result.data[6]).toBe(149);
            expect(result.data[7]).toBe(255);

            // Blue (255 * 29 >> 8 = 28.8 -> truncated to 28)
            expect(result.data[8]).toBe(28);
            expect(result.data[9]).toBe(28);
            expect(result.data[10]).toBe(28);
            expect(result.data[11]).toBe(255);

            // White (sum of all ~ 254)
            expect(result.data[12]).toBe(255);
            expect(result.data[13]).toBe(255);
            expect(result.data[14]).toBe(255);
            expect(result.data[15]).toBe(255);
        });
    });
});
