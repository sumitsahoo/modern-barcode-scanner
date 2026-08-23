import { afterEach } from "vite-plus/test";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Unmount React trees rendered by @testing-library/react after each test so
// state does not leak between cases.
afterEach(() => {
  cleanup();
});
