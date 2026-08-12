import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BarcodeScanner, type BarcodeScannerRef, type ScanResult } from "modern-barcode-scanner";
import "../../dist/modern-barcode-scanner.css";

interface CameraTestState {
  done: boolean;
  result?: ScanResult;
  error?: string;
}

declare global {
  interface Window {
    __MBS_CAMERA_TEST__: CameraTestState;
  }
}

window.__MBS_CAMERA_TEST__ = { done: false };

const CameraTest = () => {
  const scanner = useRef<BarcodeScannerRef>(null);

  useEffect(() => {
    void scanner.current?.start();
    return () => scanner.current?.stop();
  }, []);

  return (
    <div style={{ width: 640, height: 480 }}>
      <BarcodeScanner
        ref={scanner}
        scanInterval={0}
        enableVibration={false}
        onScan={(result) => {
          window.__MBS_CAMERA_TEST__ = { done: true, result };
        }}
        onError={(error) => {
          window.__MBS_CAMERA_TEST__ = { done: true, error: error.message };
        }}
      />
    </div>
  );
};

createRoot(document.querySelector("#root")!).render(<CameraTest />);
