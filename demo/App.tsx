import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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

export type DemoPreviewState = "idle" | "starting" | "active" | "result" | "error";

const PREVIEW_RESULT: ScanResult = {
  typeName: "QR code",
  scanData: "https://example.com/modern-barcode-scanner",
};

const PREVIEW_ERROR =
  "The decoder could not read that frame. Hold the code steady inside the frame and try again.";

const getScannerErrorMessage = (scannerError: Error) => {
  const message = scannerError.message.trim();

  if (!message || /^\d+$/.test(message) || /runtime|abort|exception|memory/i.test(message)) {
    return PREVIEW_ERROR;
  }

  if (/notallowed|permission|denied/i.test(message)) {
    return "Camera access is blocked. Allow camera access in your browser settings, then try again.";
  }

  if (/notfound|no camera|device not found/i.test(message)) {
    return "No camera is available. Connect or enable a camera, then try again.";
  }

  if (/notreadable|could not start|track start/i.test(message)) {
    return "The camera is busy or unavailable. Close other camera apps, then try again.";
  }

  return message;
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

const StartingScannerPreview = ({ themeColor }: { themeColor: string }) => (
  <div
    className="mbs-container"
    data-scanning="false"
    data-state="starting"
    style={{ "--mbs-primary": themeColor } as CSSProperties}
  >
    <section className="mbs-video-container" aria-label="Starting camera preview" aria-busy="true">
      <IconCamera className="mbs-placeholder-icon" />
    </section>
    <span className="mbs-sr-only" role="status">
      Starting barcode scanner
    </span>
  </div>
);

const getRelativeLuminance = (hexColor: string) => {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels) return 0;

  return channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
};

const getContrastRatio = (firstLuminance: number, secondLuminance: number) => {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const getReadableAccentText = (hexColor: string) => {
  const backgroundLuminance = getRelativeLuminance(hexColor);
  const darkText = "#000103";
  const lightText = "#FEFFFF";

  return getContrastRatio(backgroundLuminance, getRelativeLuminance(darkText)) >=
    getContrastRatio(backgroundLuminance, getRelativeLuminance(lightText))
    ? darkText
    : lightText;
};

function App({ previewState }: { previewState?: DemoPreviewState }) {
  const scannerRef = useRef<BarcodeScannerRef>(null);
  const resultDialogRef = useRef<HTMLDialogElement>(null);
  const copyResultButtonRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<ScanResult | null>(
    previewState === "result" ? PREVIEW_RESULT : null,
  );
  const [state, setState] = useState<ScannerState | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(
    previewState === "error" ? PREVIEW_ERROR : null,
  );
  const [themeColor, setThemeColor] = useState("#2563EB");

  const isScanning = previewState === "active" || (state?.isScanning ?? false);
  const isStarting = previewState === "starting" || (state?.isStarting ?? false);
  const isActive = isStarting || isScanning;
  const statusLabel = isStarting ? "Starting camera" : isScanning ? "Camera on" : "Camera off";
  const appStyle = {
    "--demo-theme": themeColor,
    "--demo-on-theme": getReadableAccentText(themeColor),
  } as CSSProperties;

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }, [themeColor]);

  useEffect(() => {
    if (!result) return;

    const dialog = resultDialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    copyResultButtonRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, [result]);

  const handleScan = useCallback((scanResult: ScanResult) => {
    setError(null);
    setResult(scanResult);
  }, []);

  const handleError = useCallback((scannerError: Error) => {
    setError(getScannerErrorMessage(scannerError));
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

  const keepDialogFocusContained = useCallback((event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab" || !resultDialogRef.current) return;

    const focusable = Array.from(
      resultDialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <main
      className="demo-app"
      style={appStyle}
      data-scanning={isActive}
      data-camera-running={isScanning}
      data-preview-state={previewState ?? "idle"}
    >
      {previewState === "active" ? (
        <ActiveScannerPreview themeColor={themeColor} />
      ) : previewState === "starting" ? (
        <StartingScannerPreview themeColor={themeColor} />
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
        <div className="demo-brand-copy">
          <h1>
            <span className="demo-brand-title-full">Modern Barcode Scanner</span>
            <span className="demo-brand-title-compact">Modern Scanner</span>
          </h1>
          <span>{statusLabel}</span>
        </div>
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

      {!isActive && !result && !error && (
        <section className="demo-idle-copy" aria-labelledby="scanner-ready-title">
          <p>Camera off</p>
          <h2 id="scanner-ready-title">Scan when ready.</h2>
          <span>Start the camera, then hold a QR code or barcode inside the frame.</span>
        </section>
      )}

      {!result && !error && (
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
            <span>{isStarting ? "Cancel" : isScanning ? "Stop scan" : "Start scan"}</span>
          </button>
        </div>
      )}

      {error && (
        <div className="demo-error" role="alert">
          <div className="demo-error-symbol" aria-hidden="true">
            !
          </div>
          <div className="demo-error-copy">
            <strong>Scanning paused</strong>
            <span>{error}</span>
          </div>
          <div className="demo-error-actions">
            <button type="button" className="demo-error-retry" onClick={startScanning}>
              Try again
            </button>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              Close
            </button>
          </div>
        </div>
      )}

      {result && (
        <dialog
          ref={resultDialogRef}
          className="demo-dialog"
          aria-labelledby="scan-result-title"
          onKeyDown={keepDialogFocusContained}
          onCancel={(event) => {
            event.preventDefault();
            dismissResult();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissResult();
          }}
        >
          <div className="demo-dialog-content">
            <div className="demo-dialog-icon" aria-hidden="true">
              <IconCheck />
            </div>
            <div className="demo-dialog-heading">
              <span>Scan complete</span>
              <h2 id="scan-result-title">{result.typeName || "Barcode detected"}</h2>
            </div>
            <output className="demo-result-data">{result.scanData}</output>
            <div className="demo-dialog-actions">
              <button
                ref={copyResultButtonRef}
                type="button"
                className="demo-button is-secondary"
                onClick={copyToClipboard}
              >
                {copied ? "Copied" : "Copy result"}
              </button>
              <button type="button" className="demo-button is-primary" onClick={startScanning}>
                Scan again
              </button>
            </div>
            <button type="button" className="demo-text-button" onClick={dismissResult}>
              Close
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}

export default App;
