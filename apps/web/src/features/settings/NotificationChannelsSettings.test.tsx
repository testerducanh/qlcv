// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationChannelsSettings } from "./NotificationChannelsSettings";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ apiFetch }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("notification channel settings", () => {
  it("loads preferences and saves per-event channel choices", async () => {
    const preferences = {
      disabledTypes: [],
      digestEnabled: false,
      channels: {},
      phoneNumber: null,
      zaloUserId: null,
      timeZone: "Asia/Bangkok",
      quietStart: null,
      quietEnd: null,
    };
    apiFetch.mockImplementation(
      async (path: string, init?: RequestInit): Promise<unknown> => {
        if (path === "/me/notification-preferences" && !init) {
          return preferences;
        }
        if (path.startsWith("/me/notification-deliveries")) {
          return { items: [] };
        }
        if (
          path === "/me/notification-preferences" &&
          init?.method === "PATCH"
        ) {
          return {
            ...preferences,
            ...JSON.parse(String(init.body)),
          };
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    render(<NotificationChannelsSettings />);

    const emailChoice = await screen.findByRole("checkbox", {
      name: "Được giao việc: Email",
    });
    fireEvent.click(emailChoice);
    fireEvent.click(screen.getByRole("button", { name: "Lưu tùy chọn kênh" }));

    await screen.findByText("Đã lưu cài đặt thông báo.");
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/me/notification-preferences",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"task.assigned":["email"]'),
        }),
      );
    });
  });
});
