import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BarcodeScanner,
  type BarcodeScannerRef,
  type ScannerState,
  type ScanResult,
} from "modern-barcode-scanner";
import "./App.css";

const CameraIcon = ({ stopped = false }: { stopped?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 16.8V9.2C3 7.43 4.43 6 6.2 6h1.05a1 1 0 0 0 .9-.55l.41-.82A2 2 0 0 1 10.35 3.5h3.3a2 2 0 0 1 1.79 1.13l.41.82a1 1 0 0 0 .9.55h1.05A3.2 3.2 0 0 1 21 9.2v7.6a3.2 3.2 0 0 1-3.2 3.2H6.2A3.2 3.2 0 0 1 3 16.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
    {stopped && (
      <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    )}
  </svg>
);

const SuccessIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="m5 13 4 4L19 7"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
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

function App() {
  const scannerRef = useRef<BarcodeScannerRef>(null);
  const resultDialogRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [state, setState] = useState<ScannerState | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState("#2563EB");

  const isScanning = state?.isScanning ?? false;
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
      <BarcodeScanner
        ref={scannerRef}
        onScan={handleScan}
        onError={handleError}
        onStateChange={setState}
        enableVibration
        themeColor={themeColor}
      />

      <header className="demo-header">
        <div className="demo-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6H7a1 1 0 0 0-1 1v2m9-3h2a1 1 0 0 1 1 1v2M9 18H7a1 1 0 0 1-1-1v-2m9 3h2a1 1 0 0 0 1-1v-2M8.5 12h7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
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
        <svg className="demo-theme-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 4h10M5 8h6m-4 4h2" stroke="currentColor" strokeLinecap="round" />
        </svg>
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
            <CameraIcon stopped={isActive} />
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
              <SuccessIcon />
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
