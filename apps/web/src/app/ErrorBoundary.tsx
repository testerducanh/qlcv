import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../components/Button";
import { viMessages } from "../i18n/vi";

const t = viMessages.app.error;

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-dialog flex-col items-center justify-center gap-16 p-24 text-center">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <p className="text-text-secondary">{t.description}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t.reload}
          </Button>
        </main>
      );
    }
    return this.props.children;
  }
}
