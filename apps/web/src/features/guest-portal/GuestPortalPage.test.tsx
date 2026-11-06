// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestPortalPage } from "./GuestPortalPage";

const { guestApiRequest } = vi.hoisted(() => ({
  guestApiRequest: vi.fn(),
}));

vi.mock("../../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return { ...actual, guestApiRequest };
});

const task = {
  id: "682d2f3c-8d55-4a90-b21c-f5f144ef289b",
  title: "Mốc bàn giao",
  description: "Gửi bản vẽ đã cập nhật.",
  status: "doing",
  dueDate: "2026-12-01",
};

beforeEach(() => {
  window.sessionStorage.setItem("qlcv.guest.token", "guest-token");
  guestApiRequest.mockImplementation((path: string) => {
    if (path === "/guest/me")
      return Promise.resolve({
        name: "Khách kiểm tra",
        email: "guest@example.test",
        projectName: "Dự án chia sẻ",
        expiresAt: "2026-12-31T00:00:00.000Z",
      });
    if (path === "/guest/tasks") return Promise.resolve([task]);
    if (path === `/guest/tasks/${task.id}`)
      return Promise.resolve({ ...task, sharedFiles: [] });
    if (path === `/guest/tasks/${task.id}/submissions`)
      return Promise.resolve([]);
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("P4.2 guest portal", () => {
  it("shows only the shared task details and submission form", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <GuestPortalPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Dự án chia sẻ/)).toBeTruthy();
    fireEvent.click(
      await screen.findByRole("button", { name: /Mốc bàn giao/ }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Mốc bàn giao",
        level: 2,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Gửi bản vẽ đã cập nhật.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gửi kết quả" })).toBeTruthy();
    expect(guestApiRequest).toHaveBeenCalledWith(
      `/guest/tasks/${task.id}`,
      "guest-token",
    );
  });
});
