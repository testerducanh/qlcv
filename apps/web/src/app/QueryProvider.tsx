import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import { viMessages } from "../i18n/vi";

const t = viMessages.app.session;

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: () =>
            show({
              title: t.loadingData,
              description: t.retryConnection,
              tone: "danger",
            }),
        }),
        mutationCache: new MutationCache(),
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              const status =
                "status" in error
                  ? Number((error as { status?: unknown }).status)
                  : 0;
              return status >= 500 && failureCount < 1;
            },
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
