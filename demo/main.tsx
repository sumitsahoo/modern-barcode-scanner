import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../src/styles.css";

// biome-ignore lint/style/noNonNullAssertion: The root element is always present in the DOM
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Choose between the two demo apps below by commenting/uncommenting: */}
    {/* <AppMinimal /> */}
    <App />
  </React.StrictMode>,
);
