// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ apiFetch }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const response = {
  period: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-30T23:59:59.999Z" },
  filters: {
    branches: [],
    departments: [],
    selectedBranchId: null,
    selectedDepartmentId: null,
  },
  projects: {
    total: 1,
    health: { red: 1, yellow: 0, green: 0 },
    byBranch: [],
  },
  tasks: {
    byStatus: [
      { status: "todo", count: 3 },
      { status: "doing", count: 2 },
      { status: "blocked", count: 1 },
      { status: "done", count: 4 },
    ],
    overdue: 1,
    dueSoon: 2,
    onTimeCompletionRate: 0.75,
    completedOnTime: 3,
    completedWithDueDate: 4,
  },
  workload: { departments: [], people: [] },
  approvals: { pending: 2, overdue: 1 },
  assignment: {
    averageResponseMinutes: 30,
    responses: 2,
    returns: 1,
    returnRate: 0.5,
    rejections: 0,
    rejectionRate: 0,
    extensionRequests: 1,
  },
  collaboration: { comments: 2, tasksWithComments: 1 },
  templates: { usage: [] },
  system: {
    activeUsers: 1,
    notificationsSent: 2,
    notificationsRead: 1,
    notificationReadRate: 0.5,
  },
  projectsList: [],
};

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("P4.1 dashboard", () => {
  it("shows operational KPI values and keeps chart counts identical in table view", async () => {
    apiFetch.mockResolvedValue(response);
    renderDashboard();

    const chart = await screen.findByRole("list", {
      name: "Biểu đồ: Việc theo trạng thái",
    });
    const chartValues = within(chart)
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/\s+/g, " ").trim());
    expect(screen.getByText("75.0% (3 / 4)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hiển thị dạng bảng" }));
    const table = await screen.findByRole("table", {
      name: "Việc theo trạng thái",
    });
    const tableValues = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent?.replace(/\s+/g, " ").trim());
    expect(tableValues).toEqual(chartValues);
  });
});
