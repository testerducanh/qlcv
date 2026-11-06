import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { viMessages } from "../i18n/vi";
import { ApiError, apiRequest, type ApiPath } from "../lib/api";

const t = viMessages.app.session;

export type SystemRole =
  | "system_admin"
  | "executive"
  | "branch_director"
  | "department_head"
  | "member";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  systemRole: SystemRole;
}

interface AuthSession {
  accessToken: string;
  user: SessionUser;
}

export type AuthStatus = "loading" | "authenticated" | "anonymous" | "error";

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  apiFetch: <T>(path: ApiPath, init?: RequestInit) => Promise<T>;
  connectSse: (
    path: ApiPath,
    onEvent: (event: { id?: string; type: string; data: unknown }) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  const roles: SystemRole[] = [
    "system_admin",
    "executive",
    "branch_director",
    "department_head",
    "member",
  ];
  return (
    typeof session.accessToken === "string" &&
    Boolean(session.user) &&
    typeof session.user?.id === "string" &&
    typeof session.user.email === "string" &&
    typeof session.user.name === "string" &&
    roles.includes(session.user.systemRole)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<AuthSession | null> | null>(null);

  const updateSession = useCallback((session: AuthSession | null) => {
    accessToken.current = session?.accessToken ?? null;
    setUser(session?.user ?? null);
    setStatus(session ? "authenticated" : "anonymous");
  }, []);

  const refreshAccess = useCallback((): Promise<AuthSession | null> => {
    if (!refreshPromise.current) {
      refreshPromise.current = apiRequest<unknown>("/auth/refresh", {
        method: "POST",
      })
        .then((response) => {
          if (!isAuthSession(response)) {
            throw new Error(t.invalidRefresh);
          }
          return response;
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) return null;
          throw error;
        })
        .finally(() => {
          refreshPromise.current = null;
        });
    }
    return refreshPromise.current;
  }, []);

  useEffect(() => {
    let active = true;
    void refreshAccess()
      .then((session) => {
        if (active) updateSession(session);
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [refreshAccess, updateSession]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let timer: number;
    const refreshBeforeExpiry = async () => {
      try {
        const session = await refreshAccess();
        updateSession(session);
        if (session)
          timer = window.setTimeout(refreshBeforeExpiry, 14 * 60_000);
      } catch {
        setStatus("error");
      }
    };
    timer = window.setTimeout(refreshBeforeExpiry, 14 * 60_000);
    return () => window.clearTimeout(timer);
  }, [status, refreshAccess, updateSession]);

  const refresh = useCallback(async () => {
    try {
      const session = await refreshAccess();
      updateSession(session);
    } catch {
      setStatus("error");
    }
  }, [refreshAccess, updateSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiRequest<unknown>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!isAuthSession(session)) {
        throw new Error(viMessages.app.login.invalidSession);
      }
      updateSession(session);
    },
    [updateSession],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      updateSession(null);
    }
  }, [updateSession]);

  const apiFetch = useCallback(
    async <T,>(path: ApiPath, init: RequestInit = {}): Promise<T> => {
      const send = (token: string | null) =>
        apiRequest<T>(path, init, token ?? undefined);
      try {
        return await send(accessToken.current);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const session = await refreshAccess();
        updateSession(session);
        if (!session) throw error;
        return send(session.accessToken);
      }
    },
    [refreshAccess, updateSession],
  );

  const connectSse = useCallback(
    (
      path: ApiPath,
      onEvent: (event: { id?: string; type: string; data: unknown }) => void,
      onError: (error: unknown) => void,
    ) => {
      let stopped = false;
      let controller: AbortController | null = null;
      let lastEventId: string | undefined;
      let retryDelay = 1000;

      const readStream = async () => {
        while (!stopped) {
          controller = new AbortController();
          try {
            const headers = new Headers({ Accept: "text/event-stream" });
            if (accessToken.current) {
              headers.set("Authorization", `Bearer ${accessToken.current}`);
            }
            if (lastEventId) headers.set("Last-Event-ID", lastEventId);
            let response = await fetch(
              `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`,
              {
                headers,
                credentials: "include",
                signal: controller.signal,
              },
            );
            if (response.status === 401) {
              const session = await refreshAccess();
              updateSession(session);
              if (!session) {
                onError(new ApiError(t.expired, 401, undefined));
                return;
              }
              headers.set("Authorization", `Bearer ${session.accessToken}`);
              response = await fetch(
                `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${path}`,
                {
                  headers,
                  credentials: "include",
                  signal: controller.signal,
                },
              );
            }
            if (!response.ok || !response.body) {
              throw new ApiError(
                `Không kết nối được luồng thông báo (${response.status}).`,
                response.status,
                undefined,
              );
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (!stopped) {
              const { done, value } = await reader.read();
              if (done) {
                buffer += decoder.decode();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              buffer = buffer.replace(/\r\n/g, "\n");
              let frameEnd = buffer.indexOf("\n\n");
              while (frameEnd >= 0) {
                const frame = buffer.slice(0, frameEnd);
                buffer = buffer.slice(frameEnd + 2);
                const fields = frame.split("\n");
                const data = fields
                  .filter((line) => line.startsWith("data:"))
                  .map((line) => line.slice(5).replace(/^ /, ""));
                if (data.length) {
                  const id = fields
                    .find((line) => line.startsWith("id:"))
                    ?.slice(3)
                    .trim();
                  if (id) lastEventId = id;
                  const eventType = fields
                    .find((line) => line.startsWith("event:"))
                    ?.slice(6)
                    .trim();
                  const joined = data.join("\n");
                  let payload: unknown = joined;
                  try {
                    payload = JSON.parse(joined);
                  } catch {
                    payload = joined;
                  }
                  onEvent({
                    ...(id ? { id } : {}),
                    type: eventType || "message",
                    data: payload,
                  });
                }
                frameEnd = buffer.indexOf("\n\n");
              }
            }
            retryDelay = 1000;
          } catch (error) {
            if (stopped) return;
            onError(error);
          }
          if (stopped) return;
          await new Promise<void>((resolve) => {
            const signal = controller?.signal;
            const timer = window.setTimeout(() => {
              signal?.removeEventListener("abort", onAbort);
              resolve();
            }, retryDelay);
            const onAbort = () => {
              window.clearTimeout(timer);
              resolve();
            };
            signal?.addEventListener("abort", onAbort, {
              once: true,
            });
          });
          retryDelay = Math.min(retryDelay * 2, 30000);
        }
      };

      void readStream();
      return () => {
        stopped = true;
        controller?.abort();
      };
    },
    [refreshAccess, updateSession],
  );

  const value = useMemo(
    () => ({ user, status, apiFetch, connectSse, login, logout, refresh }),
    [user, status, apiFetch, connectSse, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
