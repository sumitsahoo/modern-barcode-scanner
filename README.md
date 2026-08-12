<div align="center">
  <h1>📷 Modern Barcode Scanner</h1>
  <p>A high-performance barcode scanner React component with optimized detection and capability-aware camera controls.</p>

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/sumitsahoo/modern-barcode-scanner/publish.yml)
![NPM Version](https://img.shields.io/npm/v/modern-barcode-scanner)
![NPM Downloads](https://img.shields.io/npm/d18m/modern-barcode-scanner)
[![Socket Badge](https://badge.socket.dev/npm/package/modern-barcode-scanner)](https://badge.socket.dev/npm/package/modern-barcode-scanner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Interface Preview

![Modern Barcode Scanner in its camera-off idle state](./docs/assets/scanner-idle.jpg)

Desktop idle state at 1440 × 900. The same interface is audited across desktop, tablet, and mobile in the [design audit](./docs/DESIGN_AUDIT.md).

---

## ✨ Features

- 🚀 **High Performance**: A first-party ZXing-C++ WebAssembly engine prioritizes the visible scan region, rejects low-value frames off-thread, reuses memory, and copies only luminance into WASM.
- 📱 **Mobile Optimized**: Responsive camera constraints without mandatory zoom or focus settings.
- 🔦 **Torch Control**: Shown only when the active camera reports torch support.
- 🔄 **Camera Switching**: Shown only when multiple video inputs are available.
- 🎯 **Session Management**: Prevents stale results with session-based tracking.
- 🎨 **Customizable UI**: CSS-based styling with sensible defaults and CSS variables.
- ♿ **Accessible Controls**: Keyboard focus states, reduced-motion support, live scanner status, and mobile-safe touch targets.
- 📦 **TypeScript Support**: Full type definitions included out of the box.
- 📳 **Haptic Feedback**: Standard [Web Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) support for successful scans (Android/Desktop).
- 🔊 **Sound Feedback**: Optional audio cues on successful scans.

---

## 🏷️ Supported Barcode Formats

- **2D Codes**: QR Code, Micro QR, rMQR, Data Matrix, PDF417/MicroPDF417, Aztec, MaxiCode
- **Retail Codes**: EAN-13, EAN-8, UPC-A, UPC-E
- **Industrial/Standard Codes**: Code 128, Code 39, Code 93, Codabar, ITF (Interleaved 2 of 5)
- **Books**: Bookland ISBN-13
- **DataBar (GS1)**
- **Additional**: Telepen, Code 32, DX Film Edge, and more supported by the pinned ZXing-C++ reader build

---

## 📦 Installation

Choose your preferred package manager:

```bash
# npm
npm install modern-barcode-scanner

# yarn
yarn add modern-barcode-scanner

# pnpm
pnpm add modern-barcode-scanner
```

---

## 🚀 Quick Start

Here's a minimal example to get the scanner up and running in your React application:

```tsx
import { useRef, useEffect } from "react";
import { BarcodeScanner, BarcodeScannerRef, ScanResult } from "modern-barcode-scanner";

// Import the stylesheet once, anywhere in your app. The CSS ships as a separate
// file (so you can override the design tokens), so it is NOT injected
// automatically — this import is required for the scanner to look right.
import "modern-barcode-scanner/styles.css";

function App() {
  const scannerRef = useRef<BarcodeScannerRef>(null);

  const handleScan = (result: ScanResult) => {
    console.log("📦 Barcode type:", result.typeName);
    console.log("📄 Barcode data:", result.scanData);

    // Scanner automatically stops after detection.
    // Call scannerRef.current?.start() to scan again!
  };

  const handleError = (error: Error) => {
    console.error("❌ Scanner error:", error.message);
  };

  useEffect(() => {
    // Start scanning when component mounts
    scannerRef.current?.start();
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <BarcodeScanner
        ref={scannerRef}
        onScan={handleScan}
        onError={handleError}
        themeColor="#2563EB" // Customize the primary UI color!
      />
    </div>
  );
}
```

### Zero bundler configuration

Under the hood, this library uses its own pinned, reader-only ZXing-C++ WebAssembly build behind a modular decoder boundary. Both the **worker** and its **WebAssembly binary are inlined directly into the bundle** — the worker as a `Blob` and the `.wasm` inside a single-file Emscripten module.

This means you do **not** need any special bundler setup: no `optimizeDeps` exclusions, no copying a worker file out of `node_modules`, and no rules to serve `.wasm` assets. Just install, import, and go — it works the same across Vite, webpack, Next.js, and other bundlers.

> The trade-off is a larger main bundle (the WASM binary is embedded), in exchange for it working out of the box in any consumer with no setup.

The source lock, reproducible build, artifact checksums, SBOM, test matrix, and smart-enhancement roadmap are documented in the [first-party decoder migration](./docs/DECODER_MIGRATION.md). Responsive states, visual decisions, and the current Hallmark review are recorded in the [design audit](./docs/DESIGN_AUDIT.md). No `@undecaf/zbar-wasm` runtime dependency remains.

---

## 📖 API Reference

### `<BarcodeScanner />` Component

#### Props

| Prop                | Type                            | Default         | Description                                                |
| ------------------- | ------------------------------- | --------------- | ---------------------------------------------------------- |
| `onScan`            | `(result: ScanResult) => void`  | **Required**    | Callback fired when a barcode is detected.                 |
| `onError`           | `(error: Error) => void`        | `undefined`     | Callback fired when an error occurs.                       |
| `onStateChange`     | `(state: ScannerState) => void` | `undefined`     | Callback fired when scanner state changes.                 |
| `themeColor`        | `string`                        | `'#2563EB'`     | Primary color for the viewfinder, scan line, and controls. |
| `scanInterval`      | `number`                        | `100`           | Time between scan attempts (in ms).                        |
| `enableVibration`   | `boolean`                       | `true`          | Enable haptic feedback on scan (uses `navigator.vibrate`). |
| `vibrationDuration` | `number`                        | `200`           | Vibration duration (in ms).                                |
| `enableSound`       | `boolean`                       | `false`         | Enable sound feedback on scan.                             |
| `initialFacingMode` | `'user' \| 'environment'`       | `'environment'` | Initial camera to use.                                     |
| `showScanLine`      | `boolean`                       | `true`          | Show scanning animation line.                              |
| `showCameraSwitch`  | `boolean`                       | `true`          | Show camera switch button.                                 |
| `showTorchButton`   | `boolean`                       | `true`          | Show torch button (if supported).                          |
| `className`         | `string`                        | `''`            | Custom CSS class for the container.                        |
| `style`             | `React.CSSProperties`           | `undefined`     | Custom inline styles for the container.                    |

#### Ref Methods

Exposed via `useImperativeHandle` for direct control:

```tsx
interface BarcodeScannerRef {
  start: () => Promise<void>; // Starts the camera and scanning
  stop: () => void; // Stops the camera and scanning
  switchCamera: () => Promise<void>; // Toggles between front and back camera
  toggleTorch: () => Promise<void>; // Toggles the torch/flash (if supported)
  getState: () => ScannerState; // Returns current state
}
```

### TypeScript Types

```tsx
interface ScanResult {
  typeName: string; // e.g., 'QRCODE', 'EAN13', 'CODE128'
  scanData: string; // The decoded barcode string
}

interface ScannerState {
  isStarting: boolean;
  isScanning: boolean;
  facingMode: "user" | "environment";
  isTorchOn: boolean;
  isTorchSupported: boolean;
  canSwitchCamera: boolean;
}
```

---

## 🛠️ Advanced Usage

### Using the `useScanner` Hook

If you need complete control over the UI, you can use the internal hook directly:

```tsx
import {
  IconCamera,
  IconCameraOff,
  IconRotateCamera,
  IconTorchOff,
  IconTorchOn,
  useScanner,
} from "modern-barcode-scanner";

function CustomScanner() {
  const {
    scannerState,
    videoRef,
    canvasRef,
    viewfinderRef,
    handleScan,
    handleStopScan,
    handleSwitchCamera,
    handleToggleTorch,
  } = useScanner({
    onScan: (result) => console.log("Scanned:", result),
    onError: (error) => console.error("Error:", error),
    enableVibration: true,
  });

  return (
    <div style={{ position: "relative", width: "100%", height: 480 }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        ref={viewfinderRef}
        style={{ position: "absolute", inset: "25% 10%", border: "2px solid #2563eb" }}
      >
        Align the barcode here
      </div>
      <canvas ref={canvasRef} hidden />

      <div className="controls">
        <button type="button" onClick={handleScan}>
          <IconCamera /> Start
        </button>
        <button type="button" onClick={handleStopScan}>
          <IconCameraOff /> Stop
        </button>
        {scannerState.canSwitchCamera && (
          <button type="button" onClick={handleSwitchCamera}>
            <IconRotateCamera /> Switch camera
          </button>
        )}
        {scannerState.isTorchSupported && (
          <button type="button" onClick={handleToggleTorch}>
            {scannerState.isTorchOn ? <IconTorchOff /> : <IconTorchOn />}
            {scannerState.isTorchOn ? "Turn off torch" : "Turn on torch"}
          </button>
        )}
      </div>
    </div>
  );
}
```

Attach `viewfinderRef` to the region represented by your custom guide. The hook maps that displayed rectangle through the camera video's `object-fit: cover` crop and prioritizes it for decoding; when no measurable guide is attached, it safely falls back to full-frame scanning.

For custom interfaces, the package also exports `ScannerControls`, `ScanLine`, and the complete 24 px icon system: `IconCamera`, `IconCameraOff`, `IconCameraPlaceholder`, `IconRotateCamera`, `IconTorchOn`, `IconTorchOff`, `IconScanFrame`, `IconCheck`, `IconAlert`, and `IconAdjustments`. Every icon inherits `currentColor` and accepts standard React SVG props.

### Helper Utilities

The library exports several useful utilities:

```tsx
import { isPhone, getBestRearCamera, getMediaConstraints } from "modern-barcode-scanner";

// 📱 Check if device is a phone/tablet
const isMobile = isPhone();

// 📷 Get the optimal rear camera device ID (avoids ultra-wide lenses)
const cameraId = await getBestRearCamera();

// ⚙️ Get optimized media constraints based on facing mode
const constraints = await getMediaConstraints("environment");
```

`getBestRearCamera()` requests camera permission and probes available video inputs to identify the best rear camera. This can open each camera briefly, so it is an explicit advanced helper rather than part of the default startup path. `getMediaConstraints()` uses non-mandatory facing and resolution preferences for faster, more resilient startup.

---

## 🎨 Styling

The component uses CSS prefix `mbs-` (Modern Barcode Scanner) and component-scoped CSS variables for easy theming. It fills the dimensions of its parent, so give the parent an explicit height when embedding it in a page.

```tsx
<div style={{ width: "100%", height: 480 }}>
  <BarcodeScanner onScan={handleScan} />
</div>
```

### CSS Variables

Override tokens on a scanner instance (or use the `themeColor` prop for the primary accent):

```css
.my-scanner {
  --mbs-primary: #ff0055;
  --mbs-scan-color: #ff0055;
  --mbs-bg: #fff8fb;
  --mbs-bg-secondary: #ffeef5;
  --mbs-control-bg: rgba(20, 10, 16, 0.68);
}
```

Choose accent and background colors with sufficient contrast for your application, especially when overriding the defaults.

| Token                  | Default                       | Purpose                                    |
| ---------------------- | ----------------------------- | ------------------------------------------ |
| `--mbs-primary`        | `oklch(53% 0.21 256)`         | Viewfinder brackets and primary accent     |
| `--mbs-primary-dark`   | `oklch(46% 0.2 256)`          | Darker accent state                        |
| `--mbs-scan-color`     | `var(--mbs-primary)`          | Animated scan line and restrained trail    |
| `--mbs-bg`             | `oklch(98.5% 0.004 250)`      | Scanner background                         |
| `--mbs-bg-secondary`   | `oklch(95.5% 0.012 250)`      | Background highlight                       |
| `--mbs-bg-card`        | `oklch(99% 0.004 250 / 0.95)` | Raised scanner surface                     |
| `--mbs-text`           | `oklch(24% 0.02 258)`         | Primary text                               |
| `--mbs-text-secondary` | `oklch(45% 0.018 257)`        | Secondary text                             |
| `--mbs-control-bg`     | `oklch(18% 0.018 258 / 0.82)` | Camera-control toolbar background          |
| `--mbs-control-hover`  | `oklch(95% 0.008 250 / 0.18)` | Camera-control hover background            |
| `--mbs-border`         | `oklch(53% 0.21 256 / 0.2)`   | Subtle borders and placeholder glow        |
| `--mbs-on-dark`        | `oklch(96% 0.008 250)`        | Text and icons on camera surfaces          |
| `--mbs-scrim`          | `oklch(12% 0.014 258 / 0.18)` | Area outside the prioritized viewfinder    |
| `--mbs-radius-control` | `0.375rem`                    | Button and hint corner radius              |
| `--mbs-radius-frame`   | `0.875rem`                    | Viewfinder and control-group corner radius |

### Overriding Classes

```css
/* Custom container styling */
.mbs-container {
  border-radius: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Custom scan line */
.mbs-scan-line {
  height: 3px;
  box-shadow: 0 0 15px 3px var(--mbs-primary);
}

/* Custom control buttons */
.mbs-control-btn {
  background-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
}
```

---

## 🌐 Browser Requirements

The scanner targets current Chrome, Edge, Firefox, and Safari releases on desktop and mobile. A browser must provide:

- `navigator.mediaDevices.getUserMedia` for camera access.
- Web Workers, WebAssembly, Canvas, and `requestAnimationFrame`.
- A secure context. Use **HTTPS** in production (`localhost` is allowed for local development).

Camera switching, torch, vibration, and audio feedback depend on device and browser support. Unsupported optional features degrade gracefully; use `onError` to surface permission, camera, worker, and torch failures to users.

The scanner processes frames locally in the browser and does not upload camera data.

---

## ⚡ Performance Optimizations

This library is built for speed and reliability:

1. **Web Worker Processing**: Barcode detection runs entirely off the main thread.
2. **Adaptive Frame Quality**: Samples motion, blur, contrast, exposure, and glare before spending work on WASM decoding.
3. **Viewfinder-First Detection**: Scans the smaller guided region first and restores a complete, deeper full-frame pass every fifth attempt.
4. **Reusable WASM Frame Memory**: Grows the decoder input allocation only when needed and reuses it across scans.
5. **Frame Throttling**: Configurable `scanInterval` balances detection latency with device battery and CPU usage.
6. **Session Management**: Strictly prevents processing out-of-date or stale video frames.
7. **Smart Downscaling**: Intelligently reduces image resolution for faster processing while maintaining read quality.
8. **Canvas Optimizations**: Utilizes `willReadFrequently` and `desynchronized` rendering hints where supported.

---

## 🧑‍💻 Development

This project uses [**Vite+**](https://viteplus.dev) (`vp`) as its unified toolchain — one tool for building, testing, linting, and formatting (it bundles Vite, Vitest, Oxlint, and Oxfmt). Development requires Node.js `^20.19`, `^22.18`, or `>=24.11` and npm `>=11.5.1`. The npm scripts invoke the locally installed `vp` binary.

```bash
# Install the exact locked dependency graph (includes Vite+)
npm ci

# Start the live demo app at http://localhost:8080
npm run dev
```

### Scripts

| Script                     | Description                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Run the demo app with hot-module reload.                                        |
| `npm run build`            | Build the library (ESM + CJS) and emit type declarations (`tsc`).               |
| `npm run preview`          | Preview a production build of the demo.                                         |
| `npm test`                 | Run the test suite once (Vitest + jsdom + Testing Library).                     |
| `npm run lint`             | Lint the code with Oxlint.                                                      |
| `npm run format`           | Format the code with Oxfmt.                                                     |
| `npm run check`            | Format check + lint + type-check in a single command.                           |
| `npm run typecheck`        | Type-check the library and the demo with `tsc`.                                 |
| `npm run test:browser`     | Build, then test visual layouts, the worker, and a fake camera across browsers. |
| `npm run engine:build`     | Rebuild the owned WASM engine from pinned source and toolchain inputs.          |
| `npm run engine:verify`    | Verify checked-in decoder artifacts against their SHA-256 manifest.             |
| `npm run fixtures:browser` | Regenerate deterministic QR fixtures used by the browser and fake-camera tests. |

### Demo

The `demo/` app consumes the library the same way a published consumer does — importing it by package name (`modern-barcode-scanner`) and stylesheet (`modern-barcode-scanner/styles.css`) against its public API. Aliases in `demo/vite.config.ts` resolve those entry points to the local build during development, keeping the demo live-reloading while validating the real package surface.

Append `?visual-audit` to the local demo URL to open the camera-free core component audit page. It renders the real package CSS, the complete icon system, viewfinder variants, exported controls, capability-limited controls, and custom accents without requesting camera permission.

For deterministic responsive QA of the complete demo, use `?demo-state=<state>`, where `<state>` is `idle`, `starting`, `active`, `result`, or `error`. These previews reuse the production components and styles without requiring camera hardware or a test barcode. The maintained viewport/state matrix and current findings are in [`docs/DESIGN_AUDIT.md`](./docs/DESIGN_AUDIT.md).

### Testing

Unit and integration tests live next to the source as `*.test.ts(x)` and run under Vitest (via `vp test`) in a jsdom environment, with [`@testing-library/react`](https://testing-library.com/) for component tests and independently generated real barcode fixtures for decoder tests. Playwright tests under `tests/browser` validate responsive desktop, portrait, compact, and short-landscape layouts; dark and reduced-motion preferences; keyboard focus containment; the production-style inline worker in Chromium, Firefox, and WebKit; and the built public package through the complete Chromium fake-camera pipeline. Pull requests and pushes to `dev` or `main` repeat the static, dependency, reproducible-engine, unit, browser, build, and package gates in CI. Run the primary local suites with `npm test` and `npm run test:browser`.

---

## 📝 License

MIT © [Sumit Sahoo](https://github.com/sumitsahoo)

Please refer to the [LICENSE](./LICENSE) file for the project license and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the bundled decoder notice.

---

## 🤝 Credits

- Barcode decoding powered by this repository's pinned, reader-only [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) WebAssembly build.
