// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const session = {
  accessToken: "project-test-token",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.test",
    name: "Chủ dự án",
    systemRole: "member",
  },
};

const branch = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "Chi nhánh Bắc",
};
const project = {
  id: "00000000-0000-4000-8000-000000000030",
  name: "Dự án mới",
  description: null,
  branchId: branch.id,
  status: "active",
  startDate: null,
  dueDate: null,
  workCalendar: { weeklyOff: [0, 6], holidays: [] },
  progressMode: "by_workdays",
  confidentiality: "normal",
  statusLabels: {},
  branch,
  owner: { id: session.user.id, name: session.user.name },
  members: [{ role: "owner" }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("P1.10 project management", () => {
  it("validates the project name, creates the project, and allows skipping members", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/auth/refresh")) return jsonResponse(session, 201);
        if (url.endsWith("/branches/available")) {
          return jsonResponse([branch]);
        }
        if (url.includes("/projects?")) {
          return jsonResponse({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
          });
        }
        if (url.endsWith("/projects") && method === "POST") {
          return jsonResponse(project, 201);
        }
        if (url.endsWith(`/projects/${project.id}/members`)) {
          return jsonResponse([
            {
              userId: session.user.id,
              role: "owner",
              user: { ...session.user, status: "active" },
            },
          ]);
        }
        if (url.endsWith(`/projects/${project.id}/available-members`)) {
          return jsonResponse([]);
        }
        if (url.endsWith(`/projects/${project.id}`))
          return jsonResponse(project);
        return jsonResponse({ message: `Unexpected request: ${url}` }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/du-an");

    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Dự án" });
    await user.click(await screen.findByRole("button", { name: "Tạo dự án" }));
    const dialog = await screen.findByRole("dialog", { name: "Tạo dự án" });
    await user.selectOptions(
      within(dialog).getByLabelText("Chi nhánh"),
      branch.id,
    );
    await user.click(screen.getByRole("button", { name: "Tiếp theo" }));
    const nameField = screen.getByRole("textbox", { name: "Tên dự án" });
    await waitFor(() => {
      expect(nameField.getAttribute("aria-invalid")).toBe("true");
      expect(nameField.getAttribute("aria-describedby")).toContain("-error");
    });
    expect(screen.getByText("Vui lòng nhập tên dự án.")).toBeTruthy();

    await user.type(nameField, "Dự án mới");
    await user.click(screen.getByRole("button", { name: "Tiếp theo" }));
    await screen.findByText("Nội dung khởi đầu");
    await user.click(
      screen.getByRole("button", { name: "Tạo dự án và tiếp tục" }),
    );
    await screen.findByText(
      "Chọn thành viên và vai trò. Bạn có thể bỏ qua bước này.",
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/projects") &&
          init?.method === "POST" &&
          JSON.parse(String(init.body)).name === "Dự án mới",
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Quay lại" }));
    await screen.findByText("Nội dung khởi đầu");
    await user.click(
      screen.getByRole("button", { name: "Lưu thay đổi và tiếp tục" }),
    );
    await screen.findByText(
      "Chọn thành viên và vai trò. Bạn có thể bỏ qua bước này.",
    );
    await user.click(screen.getByRole("button", { name: "Bỏ qua thành viên" }));
    expect(
      await screen.findByRole("heading", { name: "Dự án mới" }),
    ).toBeTruthy();
  });

  it("adds a selected project member with the chosen role", async () => {
    const candidate = {
      id: "00000000-0000-4000-8000-000000000041",
      name: "Thành viên mới",
      email: "member@example.test",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/auth/refresh")) return jsonResponse(session, 201);
        if (url.endsWith("/branches/available")) {
          return jsonResponse([branch]);
        }
        if (url.includes("/projects?")) {
          return jsonResponse({
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
          });
        }
        if (url.endsWith("/projects") && method === "POST") {
          return jsonResponse(project, 201);
        }
        if (
          url.endsWith(`/projects/${project.id}/available-members`) &&
          method === "GET"
        ) {
          return jsonResponse([candidate]);
        }
        if (
          url.endsWith(`/projects/${project.id}/members`) &&
          method === "POST"
        ) {
          return jsonResponse({ userId: candidate.id, role: "manager" }, 201);
        }
        if (url.endsWith(`/projects/${project.id}/members`)) {
          return jsonResponse([]);
        }
        if (url.endsWith(`/projects/${project.id}`))
          return jsonResponse(project);
        return jsonResponse({ message: `Unexpected request: ${url}` }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/du-an");

    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Dự án" });
    await user.click(await screen.findByRole("button", { name: "Tạo dự án" }));
    const dialog = await screen.findByRole("dialog", { name: "Tạo dự án" });
    await user.selectOptions(
      within(dialog).getByLabelText("Chi nhánh"),
      branch.id,
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Tên dự án" }),
      "Dự án mới",
    );
    await user.click(screen.getByRole("button", { name: "Tiếp theo" }));
    await user.click(
      screen.getByRole("button", { name: "Tạo dự án và tiếp tục" }),
    );

    await user.click(
      await screen.findByRole("checkbox", {
        name: /Thành viên mới member@example.test/,
      }),
    );
    await user.selectOptions(screen.getByLabelText("Vai trò dự án"), "manager");
    await user.click(screen.getByRole("button", { name: "Mời 1 thành viên" }));
    expect(
      await screen.findByRole("heading", { name: "Dự án mới" }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/projects/${project.id}/members`) &&
          init?.method === "POST" &&
          JSON.parse(String(init.body)).userId === candidate.id &&
          JSON.parse(String(init.body)).role === "manager",
      ),
    ).toBe(true);
  });

  it("saves project settings through the shared validation form", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/auth/refresh")) return jsonResponse(session, 201);
        if (url.endsWith("/branches/available")) {
          return jsonResponse([branch]);
        }
        if (url.endsWith(`/projects/${project.id}/members`)) {
          return jsonResponse([]);
        }
        if (url.endsWith(`/projects/${project.id}/available-members`)) {
          return jsonResponse([]);
        }
        if (url.endsWith(`/projects/${project.id}`) && method === "PATCH") {
          return jsonResponse(project);
        }
        if (url.endsWith(`/projects/${project.id}`))
          return jsonResponse(project);
        return jsonResponse({ message: `Unexpected request: ${url}` }, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", `/du-an/${project.id}`);

    const user = userEvent.setup();
    render(<App />);
    const nameField = await screen.findByRole("textbox", {
      name: "Tên dự án",
    });
    await user.clear(nameField);
    await user.type(nameField, "Tên đã cập nhật");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText("Đã lưu thay đổi.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/projects/${project.id}`) &&
          init?.method === "PATCH" &&
          JSON.parse(String(init.body)).name === "Tên đã cập nhật",
      ),
    ).toBe(true);
  });
});
