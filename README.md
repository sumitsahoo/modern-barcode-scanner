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

## ✨ Features

- 🚀 **High Performance**: Web Worker-based scanning with optimized grayscale conversion.
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

- **2D Codes**: QR Code
- **Retail Codes**: EAN-13, EAN-8, UPC-A, UPC-E
- **Industrial/Standard Codes**: Code 128, Code 39, Code 93, Codabar, ITF (Interleaved 2 of 5)
- **Books**: ISBN-10, ISBN-13
- **DataBar (GS1)**
- _And more! (Powered by ZBar)_

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

Under the hood, this library currently uses `@undecaf/zbar-wasm` 0.11 for detection, behind an internal decoder boundary and running inside a Web Worker. Both the **worker** and its **WebAssembly binary are inlined directly into the bundle** — the worker as a `Blob` and the `.wasm` as embedded data.

This means you do **not** need any special bundler setup: no `optimizeDeps` exclusions, no copying a worker file out of `node_modules`, and no rules to serve `.wasm` assets. Just install, import, and go — it works the same across Vite, webpack, Next.js, and other bundlers.

> The trade-off is a larger main bundle (the WASM binary is embedded), in exchange for it working out of the box in any consumer with no setup.

The current npm release is also the latest upstream release, but its toolchain is aging. See the [decoder migration plan](./docs/DECODER_MIGRATION.md) for the staged path to a first-party build and eventual removal of the npm dependency.

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
import { useScanner } from "modern-barcode-scanner";

function CustomScanner() {
  const {
    scannerState,
    videoRef,
    canvasRef,
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
    <div>
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} hidden />

      <div className="controls">
        <button onClick={handleScan}>▶️ Start</button>
        <button onClick={handleStopScan}>⏹️ Stop</button>
        <button onClick={handleSwitchCamera}>🔄 Switch</button>
        {scannerState.isTorchOn ? "🔦 On" : "🔦 Off"}
      </div>
    </div>
  );
}
```

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

| Token                 | Default                   | Purpose                             |
| --------------------- | ------------------------- | ----------------------------------- |
| `--mbs-primary`       | `#2563eb`                 | Viewfinder and primary accent       |
| `--mbs-scan-color`    | `var(--mbs-primary)`      | Animated scan line and trail        |
| `--mbs-bg`            | `#ffffff`                 | Scanner background                  |
| `--mbs-bg-secondary`  | `#f5f8ff`                 | Background gradient highlight       |
| `--mbs-control-bg`    | `rgba(0, 0, 0, 0.5)`      | Camera-control toolbar background   |
| `--mbs-control-hover` | `rgba(255, 255, 255, .2)` | Camera-control hover background     |
| `--mbs-border`        | `rgba(37, 99, 235, .2)`   | Subtle borders and placeholder glow |

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
2. **Single-pass Luminance Conversion**: Converts RGBA frames once inside the worker-backed decoder path.
3. **Frame Throttling**: Configurable `scanInterval` perfectly balances detection speed with device battery/CPU usage.
4. **Session Management**: Strictly prevents processing out-of-date or stale video frames.
5. **Smart Downscaling**: Intelligently reduces image resolution for faster processing while maintaining read quality.
6. **Canvas Optimizations**: Utilizes `willReadFrequently` and `desynchronized` rendering hints where supported.

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

| Script              | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Run the demo app with hot-module reload.                          |
| `npm run build`     | Build the library (ESM + CJS) and emit type declarations (`tsc`). |
| `npm run preview`   | Preview a production build of the demo.                           |
| `npm test`          | Run the test suite once (Vitest + jsdom + Testing Library).       |
| `npm run lint`      | Lint the code with Oxlint.                                        |
| `npm run format`    | Format the code with Oxfmt.                                       |
| `npm run check`     | Format check + lint + type-check in a single command.             |
| `npm run typecheck` | Type-check the library and the demo with `tsc`.                   |

### Demo

The `demo/` app consumes the library the same way a published consumer does — importing it by package name (`modern-barcode-scanner`) and stylesheet (`modern-barcode-scanner/styles.css`) against its public API. Aliases in `demo/vite.config.ts` resolve those entry points to the local build during development, keeping the demo live-reloading while validating the real package surface.

Append `?visual-audit` to the local demo URL to open the camera-free core component audit page. It renders the real package CSS and exported controls across idle, starting, active, capability-limited, custom-theme, and compact layouts, and it respects light/dark preferences without requesting camera permission.

For deterministic responsive QA of the complete demo, use `?demo-state=active` to render the camera-on interface or `?demo-state=result` to render a representative successful-detection dialog. These previews reuse the production components and styles without requiring camera hardware or a test barcode.

### Testing

Tests live next to the source as `*.test.ts(x)` and run under Vitest (via `vp test`) in a jsdom environment, with [`@testing-library/react`](https://testing-library.com/) for the component tests. Run the whole suite with `npm test`.

---

## 📝 License

MIT © [Sumit Sahoo](https://github.com/sumitsahoo)

Please refer to the [LICENSE](./LICENSE) file for the project license and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the bundled decoder notice.

---

## 🤝 Credits

- Powerful barcode detection engine powered by [ZBar WASM](https://github.com/undecaf/zbar-wasm).
