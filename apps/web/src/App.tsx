import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./app/AppRoutes";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { AppQueryProvider } from "./app/QueryProvider";
import { ToastProvider } from "./components/Toast";

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppQueryProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </AppQueryProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
