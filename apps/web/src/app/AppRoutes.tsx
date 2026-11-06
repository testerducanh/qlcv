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
import { apiRequest, type ApiPath } from "../lib/api";
import { todayIso } from "../lib/date";
import { NotificationChannelsSettings } from "../features/settings/NotificationChannelsSettings";

const ProjectsPage = lazy(async () => {
  const module = await import("../features/projects/ProjectsPage");
  return { default: module.ProjectsPage };
});
const ProjectDetailsPage = lazy(async () => {
  const module = await import("../features/projects/ProjectDetailsPage");
  return { default: module.ProjectDetailsPage };
});
const TemplatesPage = lazy(async () => {
  const module = await import("../features/templates/TemplatesPage");
  return { default: module.TemplatesPage };
});
const DashboardPage = lazy(async () => {
  const module = await import("../features/dashboard/DashboardPage");
  return { default: module.DashboardPage };
});
const GuestPortalPage = lazy(async () => {
  const module = await import("../features/guest-portal/GuestPortalPage");
  return { default: module.GuestPortalPage };
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
      : "/dashboard";
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
  { to: "/dashboard", label: t.nav.dashboard, icon: <ListIcon /> },
  { to: "/du-an", label: t.nav.projects, icon: <FolderIcon /> },
  { to: "/viec-cua-toi", label: t.nav.myWork, icon: <ListIcon /> },
  { to: "/mau", label: t.nav.templates, icon: <ListIcon /> },
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
      <div className="space-y-16">
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
        <NotificationChannelsSettings />
      </div>
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

type MyWorkItem = {
  id: string;
  version: number;
  title: string;
  project: { id: string; name: string };
  dueDate: string | null;
  status: string;
  priority: string;
  labels?: Array<{ id: string; name: string }>;
  assignmentLevel?: string | null;
  canClaim?: boolean;
  assignee: { id: string; name: string } | null;
};

function MyWorkPage() {
  const { apiFetch } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<
    "assigned" | "queue" | "calendar" | "overdue" | "upcoming"
  >(() => {
    const requestedTab = params.get("tab");
    return requestedTab === "queue" ||
      requestedTab === "calendar" ||
      requestedTab === "overdue" ||
      requestedTab === "upcoming"
      ? requestedTab
      : "assigned";
  });
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [calendarAnchor, setCalendarAnchor] = useState(todayIso());
  const [calendarLabel, setCalendarLabel] = useState("");
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calendarStartOfWeek = (date: string) => {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.toISOString().slice(0, 10);
  };
  const calendarDays = (() => {
    const monthStart = `${calendarAnchor.slice(0, 7)}-01`;
    const first =
      calendarMode === "week"
        ? calendarStartOfWeek(calendarAnchor)
        : calendarStartOfWeek(monthStart);
    const amount = calendarMode === "week" ? 7 : 42;
    return Array.from({ length: amount }, (_, index) => {
      const date = new Date(`${first}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
  })();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const path: ApiPath =
      tab === "queue"
        ? "/me/assignment-queue"
        : tab === "calendar"
          ? `/me/tasks?tab=all&dueFrom=${calendarDays[0]}&dueTo=${calendarDays[calendarDays.length - 1]}&pageSize=200`
          : tab === "overdue" || tab === "upcoming"
            ? `/me/tasks?tab=${tab}`
            : "/me/tasks?tab=all";
    void apiFetch<{ items: MyWorkItem[] }>(path)
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : t.myWork.loadFailed,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, tab, calendarAnchor, calendarMode]);

  const claim = async (item: MyWorkItem) => {
    setClaimingId(item.id);
    setError(null);
    try {
      await apiFetch(`/projects/${item.project.id}/tasks/${item.id}/claim`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.myWork.claimFailed);
    } finally {
      setClaimingId(null);
    }
  };

  const moveCalendarItem = async (item: MyWorkItem, date: string) => {
    setError(null);
    try {
      await apiFetch(`/projects/${item.project.id}/tasks/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, dueDate: date }),
      });
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, dueDate: date, version: entry.version + 1 }
            : entry,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.myWork.loadFailed);
    }
  };

  const shiftCalendar = (direction: -1 | 1) => {
    const date = new Date(`${calendarAnchor}T00:00:00.000Z`);
    if (calendarMode === "month") {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + direction);
    } else {
      date.setUTCDate(date.getUTCDate() + direction * 7);
    }
    setCalendarAnchor(date.toISOString().slice(0, 10));
  };
  const calendarLabels = [
    ...new Map(
      items
        .flatMap((item) => item.labels ?? [])
        .map((label) => [label.id, label]),
    ).values(),
  ];

  return (
    <section aria-labelledby="my-work-title" className="space-y-16">
      <h1 id="my-work-title" className="text-2xl font-bold">
        {t.myWork.title}
      </h1>
      <div role="group" aria-label={t.myWork.title} className="flex gap-8">
        {(
          ["assigned", "queue", "calendar", "overdue", "upcoming"] as const
        ).map((value) => (
          <button
            key={value}
            id={`my-work-tab-${value}`}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-touch rounded-md px-16 py-8 font-medium ${
              tab === value
                ? "bg-brand-primary text-text-inverse"
                : "bg-surface-muted text-text-primary"
            }`}
          >
            {value === "assigned"
              ? t.myWork.assigned
              : value === "queue"
                ? t.myWork.queue
                : value === "calendar"
                  ? "Lịch"
                  : value === "overdue"
                    ? "Quá hạn"
                    : "Sắp đến hạn"}
          </button>
        ))}
      </div>
      <div id="my-work-panel" className="space-y-12">
        {error ? (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status">{t.session.loadingData}</p>
        ) : tab === "calendar" ? (
          <>
            <div className="flex flex-wrap gap-8">
              <Button onClick={() => shiftCalendar(-1)}>Trước</Button>
              <Button onClick={() => setCalendarAnchor(todayIso())}>
                Hôm nay
              </Button>
              <Button onClick={() => shiftCalendar(1)}>Sau</Button>
              <Button
                aria-pressed={calendarMode === "month"}
                onClick={() => setCalendarMode("month")}
              >
                Tháng
              </Button>
              <Button
                aria-pressed={calendarMode === "week"}
                onClick={() => setCalendarMode("week")}
              >
                Tuần
              </Button>
              <label className="flex items-center gap-8 text-sm">
                Lọc theo nhãn
                <select
                  value={calendarLabel}
                  onChange={(event) =>
                    setCalendarLabel(event.currentTarget.value)
                  }
                  className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
                >
                  <option value="">Tất cả</option>
                  {calendarLabels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-7">
              {calendarDays.map((date) => (
                <li
                  key={date}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const task = items.find(
                      (item) =>
                        item.id === event.dataTransfer.getData("text/plain"),
                    );
                    if (task) void moveCalendarItem(task, date);
                  }}
                  className="min-h-28 rounded-md border border-border-default p-8"
                >
                  <h2 className="font-semibold">
                    {new Intl.DateTimeFormat("vi-VN", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      timeZone: "UTC",
                    }).format(new Date(`${date}T00:00:00.000Z`))}
                  </h2>
                  <ul className="mt-4 space-y-4">
                    {items
                      .filter(
                        (item) =>
                          item.dueDate?.slice(0, 10) === date &&
                          (!calendarLabel ||
                            item.labels?.some(
                              (label) => label.id === calendarLabel,
                            )),
                      )
                      .map((item) => (
                        <li
                          key={item.id}
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/plain", item.id)
                          }
                          className="rounded border border-border-default bg-surface-muted p-8"
                        >
                          <p className="text-sm">{item.title}</p>
                          <p className="text-xs text-text-secondary">
                            {item.project.name}
                          </p>
                          <input
                            aria-label={`Đổi hạn: ${item.title}`}
                            type="date"
                            value={item.dueDate?.slice(0, 10) ?? ""}
                            onChange={(event) => {
                              if (event.currentTarget.value) {
                                void moveCalendarItem(
                                  item,
                                  event.currentTarget.value,
                                );
                              }
                            }}
                            className="mt-4 min-h-touch w-full rounded border border-border-default bg-surface-base px-4"
                          />
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
          </>
        ) : items.length ? (
          <ul className="space-y-8">
            {items.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center justify-between gap-12 p-16">
                  <div className="min-w-0">
                    <h2 className="wrap-break-word font-semibold">
                      {item.title}
                    </h2>
                    <p className="mt-4 text-sm text-text-secondary">
                      {t.myWork.project}: {item.project.name}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {t.myWork.dueDate}:{" "}
                      {item.dueDate
                        ? new Date(item.dueDate).toLocaleDateString("vi-VN")
                        : t.myWork.noDueDate}
                    </p>
                  </div>
                  {tab === "queue" && item.canClaim ? (
                    <Button
                      variant="primary"
                      loading={claimingId === item.id}
                      disabled={claimingId !== null}
                      onClick={() => void claim(item)}
                    >
                      {t.myWork.claim}
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.myWork.empty} description={t.myWork.empty} />
        )}
      </div>
    </section>
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

type NotificationItem = {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

function isNotificationItem(value: unknown): value is NotificationItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<NotificationItem>;
  return (
    typeof item.id === "string" &&
    typeof item.type === "string" &&
    typeof item.createdAt === "string" &&
    (typeof item.readAt === "string" || item.readAt === null)
  );
}

function NotificationsPage() {
  const { apiFetch, connectSse } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>(
    t.notifications.live,
  );

  useEffect(() => {
    let active = true;
    void apiFetch<{ items: NotificationItem[] }>("/notifications")
      .then((result) => {
        if (active) {
          setItems((current) => {
            const merged = new Map(
              result.items.map((item) => [item.id, item] as const),
            );
            for (const item of current) {
              if (!merged.has(item.id)) merged.set(item.id, item);
            }
            return [...merged.values()].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
          });
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : t.notifications.loadFailed,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const disconnect = connectSse(
      "/notifications/stream",
      (event) => {
        if (active) setStreamStatus(t.notifications.received);
        if (!isNotificationItem(event.data)) {
          if (active) setError(t.notifications.streamFailed);
          return;
        }
        const notification = event.data;
        if (active) {
          setError(null);
          setItems((current) => [
            notification,
            ...current.filter((item) => item.id !== notification.id),
          ]);
        }
      },
      (reason) => {
        if (active) {
          setStreamStatus(t.notifications.reconnecting);
          setError(
            reason instanceof Error
              ? reason.message
              : t.notifications.streamFailed,
          );
        }
      },
    );
    return () => {
      active = false;
      disconnect();
    };
  }, [apiFetch, connectSse]);

  const markRead = async (id: string) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "POST" });
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t.notifications.loadFailed,
      );
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t.notifications.loadFailed,
      );
    }
  };

  return (
    <section aria-labelledby="notifications-title" className="space-y-16">
      <header className="flex flex-wrap items-center justify-between gap-12">
        <h1 id="notifications-title" className="text-2xl font-bold">
          {t.notifications.title}
        </h1>
        <Button
          variant="secondary"
          onClick={() => void markAllRead()}
          disabled={!items.some((item) => item.readAt === null)}
        >
          {t.notifications.markAllRead}
        </Button>
      </header>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-text-secondary"
      >
        {streamStatus}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">{t.session.loadingData}</p>
      ) : items.length ? (
        <ul className="space-y-8">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="flex flex-wrap items-center justify-between gap-12 p-16">
                <div className="min-w-0">
                  <p className="font-medium">{item.type}</p>
                  <time
                    className="text-sm text-text-secondary"
                    dateTime={item.createdAt}
                  >
                    {new Date(item.createdAt).toLocaleString("vi-VN")}
                  </time>
                </div>
                {item.readAt ? (
                  <span className="text-sm text-text-secondary">
                    {t.notifications.received}
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void markRead(item.id)}
                  >
                    {t.notifications.markRead}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t.notifications.empty}
          description={t.notifications.empty}
        />
      )}
    </section>
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
      <Route
        path="/guest"
        element={
          <Suspense fallback={<RouteLoading />}>
            <GuestPortalPage />
          </Suspense>
        }
      />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <Navigate
                to="/dashboard"
                replace
                state={{ from: location.pathname }}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<RouteLoading />}>
                <DashboardPage />
              </Suspense>
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
          <Route path="/viec-cua-toi" element={<MyWorkPage />} />
          <Route
            path="/mau"
            element={
              <Suspense fallback={<RouteLoading />}>
                <TemplatesPage />
              </Suspense>
            }
          />
          <Route path="/cai-dat" element={<SettingsPage />} />
          <Route path="/tim-kiem" element={<SearchPlaceholder />} />
          <Route path="/thong-bao" element={<NotificationsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
