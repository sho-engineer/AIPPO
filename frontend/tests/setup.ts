import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// Each test represents a fresh browser visit. App navigation now also lives in
// window.history, which jsdom otherwise carries into the next test file.
beforeEach(() => {
  window.history.replaceState(null, "");
});
