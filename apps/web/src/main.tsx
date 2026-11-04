import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const ComponentsPage = import.meta.env.DEV
  ? lazy(() => import("./dev/ComponentsPage"))
  : null;

function Root() {
  if (ComponentsPage && window.location.pathname === "/dev/components") {
    return (
      <Suspense fallback={null}>
        <ComponentsPage />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
