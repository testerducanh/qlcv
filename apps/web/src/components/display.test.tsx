// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../test/axe";
import { Avatar, AvatarGroup, initials } from "./Avatar";
import { Badge, TaskStatusBadge, type TaskStatus } from "./Badge";
import { Card, CardTitle } from "./Card";
import { EmptyState } from "./EmptyState";
import { ProgressBar } from "./ProgressBar";
import { Skeleton, SkeletonText } from "./Skeleton";

afterEach(cleanup);

describe("Badge", () => {
  it("trạng thái việc luôn có chữ, kể cả số ngày quá hạn", () => {
    render(<TaskStatusBadge status="overdue" daysLate={2} />);
    expect(screen.getByText("Quá hạn 2 ngày")).toBeTruthy();
  });

  it("mọi trạng thái và sắc thái không lỗi trợ năng", async () => {
    const statuses: TaskStatus[] = [
      "todo",
      "doing",
      "review",
      "done",
      "blocked",
      "overdue",
    ];
    const { container } = render(
      <div>
        {statuses.map((status) => (
          <TaskStatusBadge key={status} status={status} />
        ))}
        <Badge>Pháp lý</Badge>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Avatar", () => {
  it("lấy chữ cái đầu của họ và tên", () => {
    expect(initials("Nguyễn Văn Nam")).toBe("NN");
    expect(initials("Lê")).toBe("L");
    expect(initials("   ")).toBe("?");
  });

  it("có tên truy cập, nhóm hiện +N khi vượt giới hạn", async () => {
    const people = ["An", "Bình", "Chi", "Dũng", "Em"].map((name) => ({
      name,
    }));
    const { container } = render(
      <div>
        <Avatar name="Nguyễn Văn Nam" />
        <AvatarGroup label="Người tham gia" people={people} max={3} />
      </div>,
    );
    expect(screen.getByRole("img", { name: "Nguyễn Văn Nam" })).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("ProgressBar", () => {
  it("có vai trò progressbar, giá trị đúng và bị giới hạn trong 0 đến 100", () => {
    render(
      <div>
        <ProgressBar label="Tiến độ dự án" value={40} />
        <ProgressBar label="Quá mức" value={150} />
      </div>,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars[0].getAttribute("aria-valuenow")).toBe("40");
    expect(bars[1].getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <ProgressBar label="Tiến độ dự án" value={40} />,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Card, EmptyState, Skeleton", () => {
  it("thẻ bấm được là một nút duy nhất", async () => {
    const onClick = vi.fn();
    render(
      <Card onClick={onClick}>
        <CardTitle>Giấy phép xây dựng</CardTitle>
      </Card>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Giấy phép xây dựng/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <div>
        <Card>
          <CardTitle as="h2">Tiêu đề thẻ</CardTitle>
        </Card>
        <EmptyState
          title="Hôm nay bạn chưa có việc nào"
          description="Việc mới sẽ hiện ở đây."
        />
        <SkeletonText lines={3} />
        <Skeleton className="h-12" />
      </div>,
    );
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    await expectNoA11yViolations(container);
  });
});
