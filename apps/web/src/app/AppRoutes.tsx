import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card, CardTitle } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import {
  BellIcon,
  FolderIcon,
  ListIcon,
  SettingsIcon,
} from "../components/icons";
import { viMessages } from "../i18n/vi";
import { apiRequest } from "../lib/api";

const ProjectsPage = lazy(async () => {
  const module = await import("../features/projects/ProjectsPage");
  return { default: module.ProjectsPage };
});
const ProjectDetailsPage = lazy(async () => {
  const module = await import("../features/projects/ProjectDetailsPage");
  return { default: module.ProjectDetailsPage };
});

const t = viMessages.app;

function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    const setOnlineState = () => setOnline(navigator.onLine);
    window.addEventListener("online", setOnlineState);
    window.addEventListener("offline", setOnlineState);
    return () => {
      window.removeEventListener("online", setOnlineState);
      window.removeEventListener("offline", setOnlineState);
    };
  }, []);
  return online;
}

function PageLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center gap-12">
      <Spinner />
      <span role="status">{t.session.loading}</span>
    </main>
  );
}

function RouteLoading() {
  return (
    <div
      role="status"
      className="flex min-h-128 items-center justify-center gap-12"
    >
      <Spinner />
      <span>{t.session.loading}</span>
    </div>
  );
}

function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { from?: unknown } | null)?.from;
  const destination =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//")
      ? returnTo
      : "/du-an";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "authenticated") return <Navigate to={destination} replace />;
  if (status === "loading") return <PageLoading />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.login.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-base p-16">
      <Card className="w-full max-w-dialog p-24 sm:p-32">
        <header className="mb-24 text-center">
          <p className="mb-8 text-2xl font-bold text-brand-primary">
            {t.brand}
          </p>
          <h1 className="text-xl font-bold">{t.login.title}</h1>
          <p className="mt-8 text-sm text-text-secondary">
            {t.login.description}
          </p>
        </header>
        <form className="flex flex-col gap-16" onSubmit={submit}>
          <Input
            label={t.login.email}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          <Input
            label={t.login.password}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            loadingText={t.login.submitting}
            className="w-full"
          >
            {t.login.submit}
          </Button>
          <Link
            to="/quen-mat-khau"
            className="min-h-touch self-center px-8 py-12 text-md font-medium text-brand-primary underline underline-offset-4"
          >
            {t.login.forgot}
          </Link>
        </form>
      </Card>
    </main>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await apiRequest<{ message?: string }>(
        "/auth/password/forgot",
        { method: "POST", body: JSON.stringify({ email: email.trim() }) },
      );
      setMessage(result.message ?? t.passwordReset.genericSuccess);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t.passwordReset.failed,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-base p-16">
      <Card className="w-full max-w-dialog p-24 sm:p-32">
        <h1 className="mb-8 text-xl font-bold">{t.passwordReset.title}</h1>
        <p className="mb-24 text-sm text-text-secondary">
          {t.passwordReset.description}
        </p>
        <form className="flex flex-col gap-16" onSubmit={submit}>
          <Input
            label={t.login.email}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
          {message ? <p role="status">{message}</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={loading}>
            {t.passwordReset.submit}
          </Button>
          <Link
            to="/dang-nhap"
            className="min-h-touch self-center px-8 py-12 underline"
          >
            {t.passwordReset.back}
          </Link>
        </form>
      </Card>
    </main>
  );
}

function RequireAuth() {
  const { status, refresh } = useAuth();
  const location = useLocation();
  if (status === "loading") return <PageLoading />;
  if (status === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-16 p-24 text-center">
        <h1 className="text-xl font-bold">{t.session.checkFailed}</h1>
        <p className="text-text-secondary">{t.session.checkFailedHint}</p>
        <Button variant="primary" onClick={() => void refresh()}>
          {t.session.tryAgain}
        </Button>
      </main>
    );
  }
  if (status !== "authenticated") {
    return (
      <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />
    );
  }
  return <Outlet />;
}

const navigation = [
  { to: "/du-an", label: t.nav.projects, icon: <FolderIcon /> },
  { to: "/viec-cua-toi", label: t.nav.myWork, icon: <ListIcon /> },
  { to: "/cai-dat", label: t.nav.settings, icon: <SettingsIcon /> },
];

function AppShell() {
  const { user, logout } = useAuth();
  const { show } = useToast();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const signOut = async () => {
    try {
      await logout();
    } catch {
      show({
        title: t.session.logoutOfflineTitle,
        description: t.session.logoutOfflineDescription,
        tone: "warning",
      });
    }
    navigate("/dang-nhap", { replace: true });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim();
    if (query) navigate(`/tim-kiem?q=${encodeURIComponent(query)}`);
  };

  const navLinks = (mobile = false) =>
    navigation.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/du-an"}
        className={({ isActive }) =>
          `flex min-h-touch items-center gap-12 rounded-md px-12 py-8 font-medium transition-fast ${
            isActive
              ? "bg-surface-muted text-brand-primary"
              : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          } ${mobile ? "flex-1 flex-col justify-center gap-4 text-xs" : ""}`
        }
      >
        <span aria-hidden="true" className="text-lg">
          {item.icon}
        </span>
        <span>{item.label}</span>
      </NavLink>
    ));

  return (
    <div className="min-h-dvh bg-surface-base">
      <a
        href="#main-content"
        className="sr-only z-30 rounded-md bg-surface-raised p-12 text-brand-primary focus:not-sr-only focus:fixed focus:left-16 focus:top-16"
      >
        {t.nav.skipToMain}
      </a>
      {!online ? (
        <div
          role="status"
          className="bg-status-warning px-16 py-8 text-center text-sm text-text-inverse"
        >
          {t.offline.banner}{" "}
          <Link to="/mat-ket-noi" className="font-bold underline">
            {t.offline.details}
          </Link>
        </div>
      ) : null}
      <div className="flex min-h-dvh">
        <aside className="app-sidebar hidden shrink-0 border-r border-border-default bg-surface-raised p-16 lg:block">
          <Link
            to="/du-an"
            className="mb-24 block min-h-touch px-12 py-8 text-xl font-bold text-brand-primary"
          >
            {t.brand}
          </Link>
          <nav aria-label={t.nav.primary} className="flex flex-col gap-4">
            {navLinks()}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex min-h-64 items-center gap-12 border-b border-border-default bg-surface-raised px-16">
            <Link
              to="/du-an"
              className="shrink-0 text-lg font-bold text-brand-primary lg:hidden"
            >
              {t.brand}
            </Link>
            <form
              onSubmit={submitSearch}
              role="search"
              aria-label={t.search.label}
              className="min-w-0 flex-1"
            >
              <label htmlFor="global-search" className="sr-only">
                {t.search.label}
              </label>
              <input
                id="global-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder={t.search.placeholder}
                className="app-search min-h-touch w-full rounded-md border border-border-default bg-surface-base px-12 text-md text-text-primary placeholder:text-text-secondary"
              />
            </form>
            <Link
              to="/thong-bao"
              aria-label={t.nav.notifications}
              className="inline-flex size-touch shrink-0 items-center justify-center rounded-md text-xl hover:bg-surface-muted"
            >
              <BellIcon />
            </Link>
            <details className="relative shrink-0">
              <summary className="flex min-h-touch cursor-pointer list-none items-center gap-8 rounded-md px-8 hover:bg-surface-muted">
                <span className="inline-flex size-32 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-text-inverse">
                  {user?.name.slice(0, 1).toLocaleUpperCase("vi")}
                </span>
                <span className="app-user-name hidden truncate text-sm sm:inline">
                  {user?.name}
                </span>
              </summary>
              <div className="app-menu absolute right-0 top-full z-20 mt-4 rounded-md border border-border-default bg-surface-raised p-8 shadow-3">
                <p className="truncate px-8 py-8 text-xs text-text-secondary">
                  {user?.email}
                </p>
                <Link
                  to="/cai-dat"
                  className="flex min-h-touch items-center rounded px-8 hover:bg-surface-muted"
                >
                  {t.nav.account}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="min-h-touch w-full rounded px-8 text-left text-status-danger hover:bg-surface-muted"
                >
                  {t.nav.logout}
                </button>
              </div>
            </details>
          </header>
          <main
            id="main-content"
            className="app-content mx-auto w-full flex-1 p-16 pb-96 sm:p-24 lg:pb-24"
          >
            <Outlet />
          </main>
        </div>
      </div>
      <nav
        aria-label={t.nav.mobile}
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-default bg-surface-raised px-8 pb-8 lg:hidden"
      >
        {navLinks(true)}
      </nav>
    </div>
  );
}

function PlaceholderPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h1 className="mb-16 text-2xl font-bold">{title}</h1>
      {children ?? <EmptyState title={title} description={description} />}
    </>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  return (
    <PlaceholderPage title={t.settings.title} description="">
      <Card className="app-settings-card">
        <CardTitle as="h2">{t.settings.account}</CardTitle>
        <dl className="app-settings-grid mt-16 grid gap-x-16 gap-y-12">
          <dt className="text-text-secondary">{t.settings.name}</dt>
          <dd>{user?.name}</dd>
          <dt className="text-text-secondary">{t.settings.email}</dt>
          <dd className="break-all">{user?.email}</dd>
          <dt className="text-text-secondary">{t.settings.role}</dt>
          <dd>{user?.systemRole}</dd>
        </dl>
      </Card>
    </PlaceholderPage>
  );
}

function SearchPlaceholder() {
  const [params] = useSearchParams();
  return (
    <PlaceholderPage title={t.search.title} description={t.search.comingSoon}>
      <p className="text-text-secondary">
        {t.search.keyword}: {params.get("q") || "—"}
      </p>
    </PlaceholderPage>
  );
}

function OfflinePage() {
  const online = useOnlineStatus();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-16 p-24 text-center">
      <h1 className="text-2xl font-bold">{t.offline.title}</h1>
      <p className="max-w-dialog text-text-secondary">
        {online ? t.offline.restored : t.offline.unavailable}
      </p>
      <Link
        to="/du-an"
        className="min-h-touch rounded-md px-16 py-12 font-medium text-brand-primary underline"
      >
        {t.offline.back}
      </Link>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-16 p-24 text-center">
      <h1 className="text-2xl font-bold">{t.error.notFound}</h1>
      <p className="text-text-secondary">{t.error.notFoundHint}</p>
      <Link
        to="/du-an"
        className="min-h-touch px-16 py-12 text-brand-primary underline"
      >
        {t.error.home}
      </Link>
    </main>
  );
}

function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-16 p-24 text-center">
      <h1 className="text-2xl font-bold">{t.error.forbidden}</h1>
      <p className="text-text-secondary">{t.error.forbiddenHint}</p>
      <Link
        to="/du-an"
        className="min-h-touch px-16 py-12 text-brand-primary underline"
      >
        {t.error.home}
      </Link>
    </main>
  );
}

function NotificationsPlaceholder() {
  return (
    <PlaceholderPage
      title={t.nav.notifications}
      description={t.notifications.comingSoon}
    />
  );
}

export function AppRoutes() {
  const location = useLocation();
  return (
    <Routes>
      <Route path="/dang-nhap" element={<LoginPage />} />
      <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/mat-ket-noi" element={<OfflinePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <Navigate
                to="/du-an"
                replace
                state={{ from: location.pathname }}
              />
            }
          />
          <Route
            path="/du-an"
            element={
              <Suspense fallback={<RouteLoading />}>
                <ProjectsPage />
              </Suspense>
            }
          />
          <Route
            path="/du-an/:projectId"
            element={
              <Suspense fallback={<RouteLoading />}>
                <ProjectDetailsPage />
              </Suspense>
            }
          />
          <Route
            path="/viec-cua-toi"
            element={
              <PlaceholderPage
                title={t.myWork.title}
                description={t.myWork.comingSoon}
              />
            }
          />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/tim-kiem" element={<SearchPlaceholder />} />
          <Route path="/thong-bao" element={<NotificationsPlaceholder />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
