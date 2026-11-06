// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { expectNoA11yViolations } from "./test/axe";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  if (originalOnlineDescriptor) {
    Object.defineProperty(navigator, "onLine", originalOnlineDescriptor);
  }
});

const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "onLine",
);

const session = {
  accessToken: "short-lived-access-token",
  user: {
    id: "user-1",
    email: "demo@qlcv.local",
    name: "Nguyễn An",
    systemRole: "member",
  },
};

function response(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ApiProbe() {
  const { apiFetch, status } = useAuth();
  const [result, setResult] = useState("");
  return (
    <div>
      <p>{status}</p>
      <button
        type="button"
        onClick={() => {
          void apiFetch<{ id: string }>("/auth/me")
            .then((user) => setResult(user.id))
            .catch((error: unknown) =>
              setResult(error instanceof Error ? error.message : "error"),
            );
        }}
      >
        Đọc hồ sơ
      </button>
      <p>{result}</p>
    </div>
  );
}

describe("P1.9 application shell", () => {
  it("shows a labeled login form for anonymous users and supports keyboard navigation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ message: "Unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/dang-nhap");

    const { container } = render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập" }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Email/ })).toBeTruthy();
    expect(screen.getByLabelText(/Mật khẩu/)).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
    await expectNoA11yViolations(container);

    await userEvent.setup().tab();
    expect(document.activeElement?.tagName).toBe("INPUT");
  });

  it("logs in, shows the responsive navigation, and restores a session from its cookie", async () => {
    let hasSession = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return hasSession
          ? response(session, 201)
          : response({ message: "Unauthorized" }, 401);
      }
      if (url.endsWith("/auth/login")) {
        hasSession = true;
        return response(session, 201);
      }
      if (url.endsWith("/auth/logout")) {
        hasSession = false;
        return response(undefined, 204);
      }
      return response({ message: "Not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/dang-nhap");

    const user = userEvent.setup();
    const firstRender = render(<App />);
    await screen.findByRole("heading", { name: "Đăng nhập" });
    await user.type(
      screen.getByRole("textbox", { name: /Email/ }),
      "demo@qlcv.local",
    );
    await user.type(screen.getByLabelText(/Mật khẩu/), "Demo-Only-2026!");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(
      await screen.findByRole("heading", { name: "Dashboard và KPI" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("navigation", { name: "Điều hướng chính" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Việc của tôi" })).toHaveLength(
      2,
    );
    expect(screen.queryByRole("link", { name: "Cài đặt dự án" })).toBeNull();
    expect(localStorage.length).toBe(0);
    firstRender.unmount();

    window.history.replaceState({}, "", "/du-an");
    const restoredRender = render(<App />);
    expect(await screen.findByRole("heading", { name: "Dự án" })).toBeTruthy();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).endsWith("/auth/refresh"),
        ),
      ).toBe(true);
    });
    await expectNoA11yViolations(restoredRender.container);
    await user.click(screen.getByText("Nguyễn An"));
    await user.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập" }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/auth/logout"),
      ),
    ).toBe(true);
  });

  it("redirects protected routes to login when the refresh cookie is not valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ message: "Unauthorized" }, 401)),
    );
    window.history.replaceState({}, "", "/du-an");

    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập" }),
    ).toBeTruthy();
  });

  it("refreshes the access token after a protected API request returns 401", async () => {
    let refreshCount = 0;
    const refreshedSession = {
      ...session,
      accessToken: "rotated-access-token",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) {
          refreshCount += 1;
          return response(refreshCount === 1 ? session : refreshedSession, 201);
        }
        if (url.endsWith("/auth/me")) {
          const authorization = new Headers(init?.headers).get("Authorization");
          return authorization === "Bearer short-lived-access-token"
            ? response({ message: "Unauthorized" }, 401)
            : response({ id: "user-1" });
        }
        return response({ message: "Not found" }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ApiProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("authenticated")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Đọc hồ sơ" }));
    expect(await screen.findByText("user-1")).toBeTruthy();
    const authorizedCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/auth/me"),
    );
    expect(authorizedCalls).toHaveLength(2);
    expect(
      new Headers(authorizedCalls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer short-lived-access-token");
    expect(
      new Headers(authorizedCalls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer rotated-access-token");
  });

  it("announces an offline connection without blanking the authenticated shell", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) return response(session, 201);
        if (url.endsWith("/branches/available")) return response([]);
        if (url.includes("/projects?")) {
          return response({ items: [], page: 1, pageSize: 20, total: 0 });
        }
        return response(undefined, 204);
      }),
    );
    window.history.replaceState({}, "", "/du-an");

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Dự án" })).toBeTruthy();
    expect(screen.getByText(/Bạn đang ngoại tuyến/)).toBeTruthy();
  });

  it("loads notifications, receives SSE updates, and marks items read", async () => {
    const initialNotification = {
      id: "notification-1",
      userId: "user-1",
      type: "task.assigned",
      payload: {},
      readAt: null,
      createdAt: "2026-11-05T10:00:00.000Z",
    };
    const liveNotification = {
      ...initialNotification,
      id: "notification-2",
      type: "task_due_soon",
      createdAt: "2026-11-05T10:01:00.000Z",
    };
    let streamSent = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) return response(session, 201);
        if (url.endsWith("/notifications/stream")) {
          expect(new Headers(init?.headers).get("Accept")).toBe(
            "text/event-stream",
          );
          if (streamSent) return new Response(new ReadableStream<Uint8Array>());
          streamSent = true;
          let delivered = false;
          const body = {
            getReader: () => ({
              read: async () => {
                if (delivered) return { done: true, value: undefined };
                delivered = true;
                return {
                  done: false,
                  value: new TextEncoder().encode(
                    `id: ${liveNotification.id}\nevent: notification\ndata: ${JSON.stringify(liveNotification)}\n\n`,
                  ),
                };
              },
            }),
          };
          return {
            ok: true,
            status: 200,
            body,
          } as unknown as Response;
        }
        if (url.endsWith("/notifications/read-all")) {
          return response({ read: 1 });
        }
        if (url.endsWith(`/notifications/${initialNotification.id}/read`)) {
          return response({ id: initialNotification.id, read: true });
        }
        if (url.endsWith("/notifications")) {
          return response({
            items: [initialNotification],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }
        return response({ message: "Not found" }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/thong-bao");

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("task.assigned")).toBeTruthy();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).endsWith("/notifications/stream"),
        ),
      ).toBe(true);
    });
    expect(await screen.findByText("task_due_soon")).toBeTruthy();
    const initialRow = screen.getByText("task.assigned").closest("li");
    if (!initialRow) throw new Error("Missing initial notification row");
    const markReadButton = within(initialRow).getByRole("button", {
      name: "Đánh dấu đã đọc",
    });
    await user.click(markReadButton);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith(
              `/notifications/${initialNotification.id}/read`,
            ) && init?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("shows assigned work and claims a group-queue task with its version", async () => {
    const queuedTask = {
      id: "task-1",
      version: 7,
      title: "Việc đang chờ nhận",
      project: { id: "project-1", name: "Dự án mẫu" },
      dueDate: "2026-11-20T00:00:00.000Z",
      status: "todo",
      priority: "normal",
      assignmentLevel: "standard",
      canClaim: true,
      assignee: null,
    };
    const viewOnlyTask = {
      ...queuedTask,
      id: "task-view-only",
      title: "Việc chỉ được xem",
      canClaim: false,
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/auth/refresh")) return response(session, 201);
        if (url.endsWith("/me/assignment-queue")) {
          return response({
            items: [queuedTask, viewOnlyTask],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }
        if (url.endsWith("/me/tasks?tab=all")) {
          return response({ items: [], page: 1, pageSize: 50, total: 0 });
        }
        if (
          url.endsWith("/projects/project-1/tasks/task-1/claim") &&
          init?.method === "POST"
        ) {
          return response({ ...queuedTask, assignee: session.user });
        }
        return response({ message: "Not found" }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/viec-cua-toi");

    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Việc của tôi" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Chờ nhận" }));
    expect(await screen.findByText("Việc đang chờ nhận")).toBeTruthy();
    expect(await screen.findByText("Việc chỉ được xem")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Nhận về mình" }),
    ).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Nhận về mình" }));

    await waitFor(() => {
      const claimCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/projects/project-1/tasks/task-1/claim") &&
          init?.method === "POST",
      );
      expect(claimCall?.[1]?.body).toBe(JSON.stringify({ version: 7 }));
    });
    expect(screen.getByText("Việc chỉ được xem")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nhận về mình" })).toBeNull();
  });

  it("opens the dashboard overdue-task drilldown from its query filter", async () => {
    const overdueTask = {
      id: "overdue-task",
      version: 1,
      title: "Việc đang quá hạn",
      project: { id: "project-1", name: "Dự án mẫu" },
      dueDate: "2026-11-01T00:00:00.000Z",
      status: "doing",
      priority: "normal",
      assignee: { id: session.user.id, name: session.user.name },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return response(session, 201);
      if (url.endsWith("/me/tasks?tab=overdue")) {
        return response({ items: [overdueTask], page: 1, total: 1 });
      }
      return response({ message: "Not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/viec-cua-toi?tab=overdue");

    render(<App />);

    expect(await screen.findByText("Việc đang quá hạn")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/me/tasks?tab=overdue"),
      ),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Quá hạn" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
