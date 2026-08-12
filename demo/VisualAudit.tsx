import type { CSSProperties } from "react";
import {
  BarcodeScanner,
  IconCameraPlaceholder,
  ScanLine,
  ScannerControls,
} from "modern-barcode-scanner";
import "./VisualAudit.css";

interface ActivePreviewProps {
  themeColor?: string;
  showScanLine?: boolean;
  showCameraSwitch?: boolean;
  showTorch?: boolean;
  torchOn?: boolean;
}

const ActivePreview = ({
  themeColor = "#2563EB",
  showScanLine = true,
  showCameraSwitch = true,
  showTorch = true,
  torchOn = false,
}: ActivePreviewProps) => (
  /* This camera-free preview exercises the package's real CSS and exported
     controls without requesting device permission during visual regression QA. */
  <div
    className="mbs-container visual-audit-stage is-active"
    data-scanning="true"
    data-state="scanning"
    style={{ "--mbs-primary": themeColor } as CSSProperties}
  >
    <section className="mbs-video-container" aria-label="Scanner preview">
      <div className="visual-audit-camera-feed" aria-hidden="true" />
      <div className="mbs-viewfinder-frame" aria-hidden="true">
        <div className="mbs-viewfinder-viewport">
          <ScanLine visible={showScanLine} />
        </div>
        <span className="mbs-viewfinder-hint">Align the barcode inside the frame</span>
      </div>
    </section>
    <ScannerControls
      isScanning
      isTorchOn={torchOn}
      shouldShowRotateButton={showCameraSwitch}
      shouldShowTorchButton={showTorch}
      onSwitchCamera={() => undefined}
      onToggleTorch={() => undefined}
    />
  </div>
);

const StartingPreview = () => (
  <div className="mbs-container visual-audit-stage" data-state="starting">
    <section className="mbs-video-container" aria-label="Starting scanner preview" aria-busy="true">
      <IconCameraPlaceholder className="mbs-placeholder-icon" />
    </section>
    <span className="mbs-sr-only" role="status">
      Starting barcode scanner
    </span>
  </div>
);

function VisualAudit() {
  return (
    <main className="visual-audit-page">
      <header className="visual-audit-header">
        <p>Core component QA</p>
        <h1>Modern Barcode Scanner</h1>
        <span>Idle, active, capability-aware, and themed states</span>
      </header>

      <div className="visual-audit-grid">
        <section className="visual-audit-card">
          <h2>Idle · default</h2>
          <div className="visual-audit-stage">
            <BarcodeScanner onScan={() => undefined} />
          </div>
        </section>

        <section className="visual-audit-card">
          <h2>Requesting camera</h2>
          <StartingPreview />
        </section>

        <section className="visual-audit-card">
          <h2>Active · full controls</h2>
          <ActivePreview />
        </section>

        <section className="visual-audit-card">
          <h2>Camera only</h2>
          <ActivePreview showScanLine={false} showTorch={false} />
        </section>

        <section className="visual-audit-card">
          <h2>Torch active</h2>
          <ActivePreview showCameraSwitch={false} torchOn />
        </section>

        <section className="visual-audit-card">
          <h2>Custom accent</h2>
          <ActivePreview themeColor="#7C3AED" showCameraSwitch={false} />
        </section>

        <section className="visual-audit-card">
          <h2>Warm accent</h2>
          <ActivePreview themeColor="#B45309" showTorch={false} />
        </section>
      </div>
    </main>
  );
}

export default VisualAudit;
