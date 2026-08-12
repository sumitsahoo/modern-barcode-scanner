import type { ComponentType, CSSProperties, SVGProps } from "react";
import {
  BarcodeScanner,
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

const iconSamples: ReadonlyArray<{
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}> = [
  { Icon: IconAlert, label: "Alert" },
  { Icon: IconCamera, label: "Camera" },
  { Icon: IconCameraOff, label: "Camera off" },
  { Icon: IconCameraPlaceholder, label: "Camera ready" },
  { Icon: IconRotateCamera, label: "Switch camera" },
  { Icon: IconTorchOn, label: "Torch on" },
  { Icon: IconTorchOff, label: "Torch off" },
  { Icon: IconScanFrame, label: "Scan frame" },
  { Icon: IconCheck, label: "Complete" },
  { Icon: IconAdjustments, label: "Adjustments" },
];

function VisualAudit() {
  return (
    <main className="visual-audit-page">
      <header className="visual-audit-header">
        <h1>Scanner interface audit</h1>
        <span>
          Camera-free fixtures for the idle, permission, active, capability, torch, and theme
          states.
        </span>
      </header>

      <div className="visual-audit-grid">
        <section className="visual-audit-card">
          <h2>Camera off · default</h2>
          <div className="visual-audit-stage">
            <BarcodeScanner onScan={() => undefined} />
          </div>
        </section>

        <section className="visual-audit-card">
          <h2>Camera permission · pending</h2>
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

      <section className="visual-audit-icon-section" aria-labelledby="icon-system-title">
        <div className="visual-audit-icon-heading">
          <h2 id="icon-system-title">Scanner icon system</h2>
          <span>
            One 24 × 24 grid, a 1.75px optical weight, one corner language, and state-specific
            silhouettes.
          </span>
        </div>
        <div className="visual-audit-icon-grid">
          {iconSamples.map(({ Icon, label }) => (
            <figure className="visual-audit-icon-item" key={label}>
              <Icon />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

export default VisualAudit;
