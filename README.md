<div align="center">
  <h1>📷 Modern Barcode Scanner</h1>
  <p>A high-performance barcode scanner React component with optimized detection, camera switching, torch control, and automatic phone detection.</p>

  ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/sumitsahoo/modern-barcode-scanner/publish.yml)
  ![NPM Version](https://img.shields.io/npm/v/modern-barcode-scanner)
  ![NPM Downloads](https://img.shields.io/npm/d18m/modern-barcode-scanner)
  [![Socket Badge](https://badge.socket.dev/npm/package/modern-barcode-scanner)](https://badge.socket.dev/npm/package/modern-barcode-scanner)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  
</div>

---

## ✨ Features

- 🚀 **High Performance**: Web Worker-based scanning with optimized grayscale conversion.
- 📱 **Mobile Optimized**: Automatic phone detection with appropriate camera selection.
- 🔦 **Torch Control**: Built-in torch/flash support for low-light scanning.
- 🔄 **Camera Switching**: Easy switching between front and back cameras.
- 📷 **Smart Camera Selection**: Automatically selects the best rear camera (avoids ultra-wide/telephoto).
- 🎯 **Session Management**: Prevents stale results with session-based tracking.
- 🎨 **Customizable UI**: CSS-based styling with sensible defaults and CSS variables.
- 📦 **TypeScript Support**: Full type definitions included out of the box.
- 📳 **Haptic Feedback**: Standard [Web Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) support for successful scans (Android/Desktop).
- 🔊 **Sound Feedback**: Optional audio cues on successful scans.

---

## 🏷️ Supported Barcode Formats

- **2D Codes**: QR Code, PDF417
- **Retail Codes**: EAN-13, EAN-8, UPC-A, UPC-E
- **Industrial/Standard Codes**: Code 128, Code 39, Code 93, Codabar, ITF (Interleaved 2 of 5)
- **Books**: ISBN-10, ISBN-13
- **DataBar (GS1)**
- *And more! (Powered by ZBar)*

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
import { useRef, useEffect } from 'react';
import { BarcodeScanner, BarcodeScannerRef, ScanResult } from 'modern-barcode-scanner';

// Styles are auto-imported, but you can also import manually if needed:
// import 'modern-barcode-scanner/styles.css';

function App() {
  const scannerRef = useRef<BarcodeScannerRef>(null);

  const handleScan = (result: ScanResult) => {
    console.log('📦 Barcode type:', result.typeName);
    console.log('📄 Barcode data:', result.scanData);
    
    // Scanner automatically stops after detection.
    // Call scannerRef.current?.start() to scan again!
  };

  const handleError = (error: Error) => {
    console.error('❌ Scanner error:', error.message);
  };

  useEffect(() => {
    // Start scanning when component mounts
    scannerRef.current?.start();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <BarcodeScanner
        ref={scannerRef}
        onScan={handleScan}
        onError={handleError}
        themeColor="#4db8a8" // Customize the primary UI color!
      />
    </div>
  );
}
```

### WebAssembly (WASM) Configuration

Under the hood, this library uses `@undecaf/zbar-wasm` which relies on WebAssembly. Depending on your bundler, you may need to explicitly exclude it from dependency optimization or configure it to serve `.wasm` files correctly.

**Vite Example (`vite.config.ts`):**

```typescript
export default defineConfig({
  // ... other config
  optimizeDeps: {
    exclude: ['@undecaf/zbar-wasm']
  }
});
```

---

## 📖 API Reference

### `<BarcodeScanner />` Component

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onScan` | `(result: ScanResult) => void` | **Required** | Callback fired when a barcode is detected. |
| `onError` | `(error: Error) => void` | `undefined` | Callback fired when an error occurs. |
| `onStateChange` | `(state: ScannerState) => void` | `undefined` | Callback fired when scanner state changes. |
| `themeColor` | `string` | `'#4db8a8'` | Primary theme color for UI elements and scan line. |
| `scanInterval` | `number` | `100` | Time between scan attempts (in ms). |
| `enableVibration` | `boolean` | `true` | Enable haptic feedback on scan (uses `navigator.vibrate`). |
| `vibrationDuration`| `number` | `200` | Vibration duration (in ms). |
| `enableSound` | `boolean` | `false` | Enable sound feedback on scan. |
| `initialFacingMode`| `'user' \| 'environment'` | `'environment'`| Initial camera to use. |
| `showScanLine` | `boolean` | `true` | Show scanning animation line. |
| `showCameraSwitch` | `boolean` | `true` | Show camera switch button. |
| `showTorchButton` | `boolean` | `true` | Show torch button (if supported). |
| `className` | `string` | `''` | Custom CSS class for the container. |
| `style` | `React.CSSProperties` | `undefined` | Custom inline styles for the container. |

#### Ref Methods

Exposed via `useImperativeHandle` for direct control:

```tsx
interface BarcodeScannerRef {
  start: () => Promise<void>;        // Starts the camera and scanning
  stop: () => void;                  // Stops the camera and scanning
  switchCamera: () => Promise<void>; // Toggles between front and back camera
  toggleTorch: () => Promise<void>;  // Toggles the torch/flash (if supported)
  getState: () => ScannerState;      // Returns current state
}
```

### TypeScript Types

```tsx
interface ScanResult {
  typeName: string;  // e.g., 'QRCODE', 'EAN13', 'CODE128'
  scanData: string;  // The decoded barcode string
}

interface ScannerState {
  isScanning: boolean;
  facingMode: 'user' | 'environment';
  isTorchOn: boolean;
}
```

---

## 🛠️ Advanced Usage

### Using the `useScanner` Hook

If you need complete control over the UI, you can use the internal hook directly:

```tsx
import { useScanner } from 'modern-barcode-scanner';

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
    onScan: (result) => console.log('Scanned:', result),
    onError: (error) => console.error('Error:', error),
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
        {scannerState.isTorchOn ? '🔦 On' : '🔦 Off'}
      </div>
    </div>
  );
}
```

### Helper Utilities

The library exports several useful utilities:

```tsx
import { 
  isPhone, 
  getBestRearCamera, 
  getMediaConstraints 
} from 'modern-barcode-scanner';

// 📱 Check if device is a phone/tablet
const isMobile = isPhone();

// 📷 Get the optimal rear camera device ID (avoids ultra-wide lenses)
const cameraId = await getBestRearCamera();

// ⚙️ Get optimized media constraints based on facing mode
const constraints = await getMediaConstraints('environment');
```

---

## 🎨 Styling

The component uses CSS prefix `mbs-` (Modern Barcode Scanner) and supports native CSS variables for easy theming.

### CSS Variables

You can easily override the primary color globally or via the `themeColor` prop:
```css
:root {
  --mbs-primary: #ff0055; /* Changes scan line and active icon colors */
}
```

### Overriding Classes

```css
/* Custom container styling */
.mbs-container {
  border-radius: 1rem;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
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

## 🌐 Browser Support

| Browser / OS | Version |
|--------------|---------|
| 🟢 Google Chrome | 79+ |
| 🔵 Microsoft Edge | 79+ |
| 🟠 Mozilla Firefox | 79+ |
| 🧭 Safari (macOS) | 14.1+ |
| 📱 Chrome for Android | Supported |
| 🍎 Safari on iOS | 14.5+ |

> **⚠️ Note**: Camera access requires a secure context (**HTTPS**) in production environments!

---

## ⚡ Performance Optimizations

This library is built for speed and reliability:
1. **Web Worker Processing**: Barcode detection runs entirely off the main thread.
2. **Grayscale Conversion**: Uses bitwise operations for incredibly fast image matrix processing.
3. **Frame Throttling**: Configurable `scanInterval` perfectly balances detection speed with device battery/CPU usage.
4. **Session Management**: Strictly prevents processing out-of-date or stale video frames.
5. **Smart Downscaling**: Intelligently reduces image resolution for faster processing while maintaining read quality.
6. **Canvas Optimizations**: Utilizes `willReadFrequently` and `desynchronized` rendering hints where supported.

---

## 📝 License

MIT © [Sumit Sahoo](https://github.com/sumitsahoo)

Please refer to the [LICENSE](./LICENSE) file for the full text.

---

## 🤝 Credits

- Powerful barcode detection engine powered by [ZBar WASM](https://github.com/nickinchern/nickinchern-undecaf-zbar-wasm).
