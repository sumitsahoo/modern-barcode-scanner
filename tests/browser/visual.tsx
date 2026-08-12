import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { type DemoPreviewState } from "../../demo/App";
import VisualAudit from "../../demo/VisualAudit";
import "../../dist/modern-barcode-scanner.css";

const searchParams = new URLSearchParams(window.location.search);
const showVisualAudit = searchParams.has("visual-audit");
const requestedPreviewState = searchParams.get("demo-state");
const previewState: DemoPreviewState | undefined =
  requestedPreviewState === "active" || requestedPreviewState === "result"
    ? requestedPreviewState
    : undefined;

document.documentElement.toggleAttribute("data-visual-audit", showVisualAudit);

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    {showVisualAudit ? <VisualAudit /> : <App previewState={previewState} />}
  </StrictMode>,
);
