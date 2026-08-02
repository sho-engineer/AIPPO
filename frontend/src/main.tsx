import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* どこか1か所で例外が出ても、真っ白な画面にはしない */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
