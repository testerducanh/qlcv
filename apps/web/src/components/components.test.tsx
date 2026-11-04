// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../test/axe";
import { Button, type ButtonVariant } from "./Button";
import { IconButton } from "./IconButton";
import { PlusIcon } from "./icons";
import { Input } from "./Input";
import { Textarea } from "./Textarea";

afterEach(cleanup);

describe("Button", () => {
  it("bấm gọi hàm xử lý một lần", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lưu</Button>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Lưu" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("đang tải thì chặn bấm lặp và đặt aria-busy", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingText="Đang lưu" onClick={onClick}>
        Lưu
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("vô hiệu hóa thì không bấm được", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Lưu
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  for (const variant of [
    "primary",
    "secondary",
    "ghost",
    "danger",
  ] as ButtonVariant[]) {
    it(`biến thể ${variant} không có lỗi trợ năng`, async () => {
      const { container } = render(
        <Button variant={variant}>Thêm việc con</Button>,
      );
      await expectNoA11yViolations(container);
    });
  }
});

describe("IconButton", () => {
  it("có tên truy cập và không lỗi trợ năng", async () => {
    const { container } = render(
      <IconButton label="Thêm việc" icon={<PlusIcon />} />,
    );
    expect(screen.getByRole("button", { name: "Thêm việc" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("Input", () => {
  it("nhãn gắn với ô nhập", () => {
    render(<Input label="Tên việc" />);
    expect(screen.getByLabelText("Tên việc")).toBeTruthy();
  });

  it("lỗi đặt aria-invalid và liên kết thông báo qua aria-describedby", () => {
    render(<Input label="Tên việc" error="Tên việc không được để trống." />);
    const input = screen.getByLabelText("Tên việc");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toContain(
      "không được để trống",
    );
  });

  it("không lỗi trợ năng ở các trạng thái", async () => {
    const { container } = render(
      <div>
        <Input label="Mặc định" hint="Gợi ý ngắn" />
        <Input label="Bắt buộc" required />
        <Input label="Có lỗi" error="Giá trị không hợp lệ." />
        <Input label="Vô hiệu" disabled />
        <Input label="Đang kiểm tra" loading />
        <Textarea label="Ghi chú" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
