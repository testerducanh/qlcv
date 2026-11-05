// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

    expect(await screen.findByRole("heading", { name: "Dự án" })).toBeTruthy();
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
});
