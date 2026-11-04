// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../test/axe";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";
import { DotsIcon } from "./icons";
import { IconButton } from "./IconButton";
import { Menu } from "./Menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { ToastProvider, useToast } from "./Toast";
import { Tooltip } from "./Tooltip";

afterEach(cleanup);

describe("Dialog", () => {
  it("mở bằng bàn phím, giữ focus bên trong, Esc đóng và trả focus về nút mở", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Mở</Button>}
        title="Xác nhận"
        description="Mô tả ngắn"
      >
        <p>Nội dung</p>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Mở" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận" });

    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("không lỗi trợ năng khi đang mở", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>Mở</Button>}
        title="Xác nhận"
        description="Mô tả ngắn"
      >
        <p>Nội dung</p>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Mở" }));
    await screen.findByRole("dialog");
    await expectNoA11yViolations(document.body);
  });
});

describe("Drawer", () => {
  function Harness({ dirty }: { dirty: boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Chi tiết việc"
        dirty={dirty}
      >
        <p>Nội dung</p>
      </Drawer>
    );
  }

  it("Esc đóng ngay khi không có thay đổi chưa lưu", async () => {
    const user = userEvent.setup();
    render(<Harness dirty={false} />);
    await screen.findByRole("dialog", { name: "Chi tiết việc" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("có thay đổi chưa lưu thì hỏi xác nhận, chọn bỏ thay đổi mới đóng", async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);
    await screen.findByRole("dialog", { name: "Chi tiết việc" });

    await user.keyboard("{Escape}");
    await screen.findByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" });
    await user.click(
      screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Bỏ thay đổi chưa lưu?" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Chi tiết việc" })).toBeTruthy();

    await user.keyboard("{Escape}");
    await user.click(
      await screen.findByRole("button", { name: "Bỏ thay đổi" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Menu", () => {
  function setup() {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <Menu
        trigger={<IconButton label="Thao tác" icon={<DotsIcon />} />}
        items={[
          { label: "Đổi tên", onSelect: onRename },
          {
            label: "Xóa việc",
            onSelect: onDelete,
            danger: true,
            separatorBefore: true,
          },
        ]}
      />,
    );
    return {
      onRename,
      onDelete,
      trigger: screen.getByRole("button", { name: "Thao tác" }),
    };
  }

  it("Enter mở menu, Enter chọn mục đầu tiên", async () => {
    const user = userEvent.setup();
    const { onRename, trigger } = setup();
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1));
  });

  it("mũi tên xuống đến mục cuối, Esc đóng và trả focus", async () => {
    const user = userEvent.setup();
    const { onDelete, trigger } = setup();
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));

    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("Tabs", () => {
  it("phím mũi tên đổi tab và nội dung", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Chế độ xem">
          <TabsTrigger value="a">Danh sách</TabsTrigger>
          <TabsTrigger value="b">Kanban</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Nội dung A</TabsContent>
        <TabsContent value="b">Nội dung B</TabsContent>
      </Tabs>,
    );
    screen.getByRole("tab", { name: "Danh sách" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "Kanban" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Nội dung B")).toBeTruthy();
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Chế độ xem">
          <TabsTrigger value="a">Danh sách</TabsTrigger>
          <TabsTrigger value="b">Kanban</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Nội dung A</TabsContent>
        <TabsContent value="b">Nội dung B</TabsContent>
      </Tabs>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Tooltip", () => {
  it("hiện khi focus bàn phím và Esc đóng", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Giải thích ngắn">
        <Button>Nút</Button>
      </Tooltip>,
    );
    screen.getByRole("button", { name: "Nút" }).focus();
    expect(
      (await screen.findAllByText("Giải thích ngắn")).length,
    ).toBeGreaterThan(0);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryAllByText("Giải thích ngắn")).toHaveLength(0),
    );
  });
});

describe("Toast", () => {
  function Harness({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <>
        <Button
          onClick={() =>
            toast.show({
              title: "Đã xóa 5 việc",
              actionLabel: "Hoàn tác",
              onAction: onUndo,
            })
          }
        >
          Xóa
        </Button>
        <Button
          onClick={() => toast.show({ title: `Thông báo ${Math.random()}` })}
        >
          Thêm
        </Button>
      </>
    );
  }

  it("hiện thông báo và nút Hoàn tác gọi đúng hàm", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Harness onUndo={onUndo} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Xóa" }));
    expect(
      (await screen.findAllByText("Đã xóa 5 việc")).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("chỉ giữ tối đa 3 thông báo", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness onUndo={() => undefined} />
      </ToastProvider>,
    );
    const add = screen.getByRole("button", { name: "Thêm" });
    for (let i = 0; i < 5; i += 1) await user.click(add);
    await waitFor(() =>
      expect(document.querySelectorAll("[data-qlcv-toast]")).toHaveLength(3),
    );
  });
});
