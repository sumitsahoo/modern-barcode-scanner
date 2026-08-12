import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import VisualAudit from "./VisualAudit";
import "modern-barcode-scanner/styles.css";

const showVisualAudit = new URLSearchParams(window.location.search).has("visual-audit");
document.documentElement.toggleAttribute("data-visual-audit", showVisualAudit);

// biome-ignore lint/style/noNonNullAssertion: The root element is always present in the DOM
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showVisualAudit ? <VisualAudit /> : <App />}</React.StrictMode>,
);
