# Modern Barcode Scanner

A high-performance barcode scanner React component with optimized detection, camera switching, torch control, and automatic phone detection.

[![npm version](https://badge.fury.io/js/modern-barcode-scanner.svg)](https://www.npmjs.com/package/modern-barcode-scanner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 **High Performance**: Web Worker-based scanning with optimized grayscale conversion
- 📱 **Mobile Optimized**: Automatic phone detection with appropriate camera selection
- 🔦 **Torch Control**: Built-in torch/flash support for low-light scanning
- 🔄 **Camera Switching**: Easy switching between front and back cameras
- 📷 **Smart Camera Selection**: Automatically selects the best rear camera (avoids ultra-wide/telephoto)
- 🎯 **Session Management**: Prevents stale results with session-based tracking
- 🎨 **Customizable UI**: CSS-based styling with sensible defaults
- 📦 **TypeScript Support**: Full type definitions included
- 🔊 **Feedback Options**: Haptic vibration and optional sound feedback

## Supported Barcode Formats

- QR Code
- EAN-13, EAN-8
- UPC-A, UPC-E
- Code 128, Code 39, Code 93
- Codabar
- ITF (Interleaved 2 of 5)
- ISBN-10, ISBN-13
- DataBar (GS1)
- PDF417
- And more (powered by ZBar)

## Installation

```bash
npm install modern-barcode-scanner
```

or

```bash
yarn add modern-barcode-scanner
```

or

```bash
pnpm add modern-barcode-scanner
```

## Quick Start

```tsx
import { useRef, useEffect } from 'react';
import { BarcodeScanner, BarcodeScannerRef, ScanResult } from 'modern-barcode-scanner';
// Styles are auto-imported, but you can also import manually:
// import 'modern-barcode-scanner/styles.css';

function App() {
  const scannerRef = useRef<BarcodeScannerRef>(null);

  const handleScan = (result: ScanResult) => {
    console.log('Barcode type:', result.typeName);
    console.log('Barcode data:', result.scanData);
    
    // Scanner automatically stops after detection
    // Call scannerRef.current?.start() to scan again
  };

  const handleError = (error: Error) => {
    console.error('Scanner error:', error.message);
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
      />
    </div>
  );
}
```

## API Reference

### BarcodeScanner Component

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onScan` | `(result: ScanResult) => void` | **Required** | Callback fired when a barcode is detected |
| `onError` | `(error: Error) => void` | - | Callback fired when an error occurs |
| `onStateChange` | `(state: ScannerState) => void` | - | Callback fired when scanner state changes |
| `scanInterval` | `number` | `100` | Time between scan attempts (ms) |
| `enableVibration` | `boolean` | `true` | Enable haptic feedback on scan |
| `vibrationDuration` | `number` | `200` | Vibration duration (ms) |
| `enableSound` | `boolean` | `false` | Enable sound feedback on scan |
| `initialFacingMode` | `'user' \| 'environment'` | `'environment'` | Initial camera |
| `className` | `string` | - | Custom CSS class |
| `style` | `React.CSSProperties` | - | Custom inline styles |
| `showScanLine` | `boolean` | `true` | Show scanning animation |
| `showCameraSwitch` | `boolean` | `true` | Show camera switch button |
| `showTorchButton` | `boolean` | `true` | Show torch button |

#### Ref Methods

```tsx
interface BarcodeScannerRef {
  start: () => Promise<void>;      // Start scanning
  stop: () => void;                // Stop scanning
  switchCamera: () => Promise<void>; // Switch front/back camera
  toggleTorch: () => Promise<void>;  // Toggle torch/flash
  getState: () => ScannerState;    // Get current state
}
```

### Types

```tsx
interface ScanResult {
  typeName: string;  // e.g., 'QRCODE', 'EAN13', 'CODE128'
  scanData: string;  // The decoded barcode data
}

interface ScannerState {
  isScanning: boolean;
  facingMode: 'user' | 'environment';
  isTorchOn: boolean;
}
```

## Advanced Usage

### Using the Hook Directly

For custom implementations, you can use the `useScanner` hook:

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
    onScan: (result) => console.log(result),
    onError: (error) => console.error(error),
  });

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} hidden />
      <button onClick={handleScan}>Start</button>
      <button onClick={handleStopScan}>Stop</button>
    </div>
  );
}
```

### Utility Functions

```tsx
import { 
  isPhone, 
  getBestRearCamera, 
  getMediaConstraints 
} from 'modern-barcode-scanner';

// Check if device is a phone/tablet
const isMobile = isPhone();

// Get the best rear camera device ID
const cameraId = await getBestRearCamera();

// Get optimized media constraints
const constraints = await getMediaConstraints('environment');
```

## Styling

The component uses CSS classes prefixed with `mbs-` (Modern Barcode Scanner). You can override these styles:

```css
/* Custom container styling */
.mbs-container {
  border-radius: 1rem;
}

/* Custom scan line color */
.mbs-scan-line {
  background-color: #00ff00;
  box-shadow: 0 0 15px 2px rgba(0, 255, 0, 0.8);
}

/* Custom control buttons */
.mbs-control-btn {
  background-color: rgba(0, 0, 0, 0.7);
}
```

## Browser Support

- Chrome/Edge 79+
- Firefox 79+
- Safari 14.1+
- Chrome for Android
- Safari on iOS 14.5+

**Note**: Camera access requires HTTPS in production.

## Performance Optimizations

This library includes several optimizations:

1. **Web Worker Processing**: Barcode detection runs in a separate thread
2. **Grayscale Conversion**: Uses bitwise operations for fast image processing
3. **Frame Throttling**: Configurable scan interval to balance speed and CPU usage
4. **Session Management**: Prevents processing of stale frames
5. **Smart Downscaling**: Reduces resolution for faster processing without quality loss
6. **Canvas Optimization**: Uses `willReadFrequently` and `desynchronized` hints

## License

MIT © [Sumit Sahoo](https://github.com/sumitsahoo)

## Credits

- Barcode detection powered by [ZBar WASM](https://github.com/nickinchern/nickinchern-undecaf-zbar-wasm)
