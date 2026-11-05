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

  const value = useMemo(
    () => ({ user, status, apiFetch, login, logout, refresh }),
    [user, status, apiFetch, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
