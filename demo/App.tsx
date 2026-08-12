import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BarcodeScanner,
  IconAdjustments,
  IconCamera,
  IconCameraOff,
  IconCheck,
  IconScanFrame,
  ScanLine,
  ScannerControls,
  type BarcodeScannerRef,
  type ScannerState,
  type ScanResult,
} from "modern-barcode-scanner";
import "./App.css";

export type DemoPreviewState = "active" | "result";

const PREVIEW_RESULT: ScanResult = {
  typeName: "QR code",
  scanData: "https://example.com/modern-barcode-scanner",
};

const ActiveScannerPreview = ({ themeColor }: { themeColor: string }) => (
  <div
    className="mbs-container demo-camera-preview"
    data-scanning="true"
    data-state="scanning"
    style={{ "--mbs-primary": themeColor } as CSSProperties}
  >
    <section className="mbs-video-container" aria-label="Active camera preview">
      <div className="demo-camera-preview-feed" aria-hidden="true" />
      <div className="mbs-viewfinder-frame" aria-hidden="true">
        <div className="mbs-viewfinder-viewport">
          <ScanLine visible />
        </div>
        <span className="mbs-viewfinder-hint">Align the barcode inside the frame</span>
      </div>
    </section>
    <span className="mbs-sr-only" role="status">
      Barcode scanner active
    </span>
    <ScannerControls
      isScanning
      isTorchOn={false}
      shouldShowRotateButton
      shouldShowTorchButton
      onSwitchCamera={() => undefined}
      onToggleTorch={() => undefined}
    />
  </div>
);

const getReadableAccentText = (hexColor: string) => {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels) return "#ffffff";

  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);

  // Black/white with this crossover guarantees at least 4.5:1 contrast for
  // arbitrary colors selected through the native picker.
  return luminance > 0.179 ? "#000000" : "#ffffff";
};

function App({ previewState }: { previewState?: DemoPreviewState }) {
  const scannerRef = useRef<BarcodeScannerRef>(null);
  const resultDialogRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ScanResult | null>(
    previewState === "result" ? PREVIEW_RESULT : null,
  );
  const [state, setState] = useState<ScannerState | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState("#2563EB");

  const isScanning = previewState === "active" || (state?.isScanning ?? false);
  const isStarting = state?.isStarting ?? false;
  const isActive = isStarting || isScanning;
  const appStyle = {
    "--demo-theme": themeColor,
    "--demo-on-theme": getReadableAccentText(themeColor),
  } as CSSProperties;

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }, [themeColor]);

  useEffect(() => {
    if (!result) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    resultDialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setResult(null);
        return;
      }

      if (event.key !== "Tab" || !resultDialogRef.current) return;

      const focusable = Array.from(
        resultDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === resultDialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [result]);

  const handleScan = useCallback((scanResult: ScanResult) => {
    setError(null);
    setResult(scanResult);
  }, []);

  const handleError = useCallback((scannerError: Error) => {
    setError(scannerError.message);
  }, []);

  const startScanning = useCallback(() => {
    setResult(null);
    setCopied(false);
    setError(null);
    void scannerRef.current?.start();
  }, []);

  const stopScanning = useCallback(() => {
    scannerRef.current?.stop();
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!result?.scanData) return;

    try {
      await navigator.clipboard.writeText(result.scanData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the result to the clipboard.");
    }
  }, [result?.scanData]);

  const dismissResult = useCallback(() => {
    setResult(null);
    setCopied(false);
  }, []);

  return (
    <main className="demo-app" style={appStyle} data-scanning={isActive}>
      {previewState === "active" ? (
        <ActiveScannerPreview themeColor={themeColor} />
      ) : (
        <BarcodeScanner
          ref={scannerRef}
          onScan={handleScan}
          onError={handleError}
          onStateChange={setState}
          enableVibration
          themeColor={themeColor}
        />
      )}

      <header className="demo-header">
        <div className="demo-brand-mark" aria-hidden="true">
          <IconScanFrame />
        </div>
        <h1>Modern Barcode Scanner</h1>
      </header>

      <label className="demo-theme-control" htmlFor="theme-color">
        <input
          id="theme-color"
          type="color"
          value={themeColor}
          onChange={(event) => setThemeColor(event.target.value)}
          aria-label="Choose scanner accent color"
        />
        <span
          className="demo-theme-swatch"
          style={{ backgroundColor: themeColor }}
          aria-hidden="true"
        />
        <IconAdjustments className="demo-theme-icon" />
      </label>

      {!result && (
        <div className="demo-primary-controls">
          <button
            type="button"
            className={`demo-scan-button ${isActive ? "is-stopping" : "is-starting"}`}
            onClick={isActive ? stopScanning : startScanning}
            aria-label={
              isStarting ? "Cancel camera" : isScanning ? "Stop scanning" : "Start scanning"
            }
          >
            {isActive ? <IconCameraOff /> : <IconCamera />}
          </button>
        </div>
      )}

      {error && (
        <div className="demo-error" role="alert">
          <strong>Unable to continue</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {result && (
        <div className="demo-backdrop">
          <div
            ref={resultDialogRef}
            className="demo-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-result-title"
            tabIndex={-1}
          >
            <div className="demo-dialog-icon">
              <IconCheck />
            </div>
            <h2 id="scan-result-title">{result.typeName || "Barcode detected"}</h2>
            <output className="demo-result-data">{result.scanData}</output>
            <div className="demo-dialog-actions">
              <button type="button" className="demo-button is-secondary" onClick={copyToClipboard}>
                {copied ? "Copied!" : "Copy result"}
              </button>
              <button type="button" className="demo-button is-primary" onClick={startScanning}>
                Scan again
              </button>
            </div>
            <button type="button" className="demo-text-button" onClick={dismissResult}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
