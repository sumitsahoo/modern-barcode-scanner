import React from "react";
import ReactDOM from "react-dom/client";
import App, { type DemoPreviewState } from "./App";
import VisualAudit from "./VisualAudit";
import "modern-barcode-scanner/styles.css";

const searchParams = new URLSearchParams(window.location.search);
const showVisualAudit = searchParams.has("visual-audit");
const requestedPreviewState = searchParams.get("demo-state");
const previewState: DemoPreviewState | undefined =
  requestedPreviewState === "active" || requestedPreviewState === "result"
    ? requestedPreviewState
    : undefined;
document.documentElement.toggleAttribute("data-visual-audit", showVisualAudit);

// biome-ignore lint/style/noNonNullAssertion: The root element is always present in the DOM
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {showVisualAudit ? <VisualAudit /> : <App previewState={previewState} />}
  </React.StrictMode>,
);
