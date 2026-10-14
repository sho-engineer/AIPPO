import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { experienceForPath } from "./app/experience";
import "./index.css";

const KidsLearningPage = lazy(() => import("./pages/KidsLearningPage"));
const kids = experienceForPath(window.location.pathname) === "kids";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* どこか1か所で例外が出ても、真っ白な画面にはしない */}
    <ErrorBoundary>
      {kids ? (
        <Suspense fallback={<p role="status">ポーのぼうけんを準備しています…</p>}>
          <KidsLearningPage />
        </Suspense>
      ) : (
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
