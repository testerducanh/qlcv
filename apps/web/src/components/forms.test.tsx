// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../test/axe";
import { Checkbox } from "./Checkbox";
import { RadioGroup } from "./RadioGroup";
import { Select } from "./Select";
import { Switch } from "./Switch";

afterEach(cleanup);

const priorities = [
  { value: "low", label: "Thấp" },
  { value: "normal", label: "Thường" },
  { value: "high", label: "Cao" },
];

describe("Checkbox", () => {
  it("bấm và phím Space đều đổi trạng thái", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Gửi thông báo" onCheckedChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Gửi thông báo" });
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
    box.focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("trạng thái nửa chọn có aria-checked là mixed", () => {
    render(<Checkbox label="Chọn tất cả" checked="indeterminate" />);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
      "mixed",
    );
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <div>
        <Checkbox label="Mặc định" />
        <Checkbox label="Đã chọn" defaultChecked />
        <Checkbox label="Nửa chọn" checked="indeterminate" />
        <Checkbox label="Vô hiệu" disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("RadioGroup", () => {
  it("phím mũi tên đổi lựa chọn", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup
        label="Mức ưu tiên"
        options={priorities}
        defaultValue="low"
      />,
    );
    screen.getByRole("radio", { name: "Thấp" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen
        .getByRole("radio", { name: "Thường" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("có tên nhóm và không lỗi trợ năng", async () => {
    const { container } = render(
      <RadioGroup
        label="Mức ưu tiên"
        options={priorities}
        defaultValue="low"
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Mức ưu tiên" }),
    ).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("Switch", () => {
  it("có vai trò switch và phím Space bật tắt", async () => {
    const user = userEvent.setup();
    render(<Switch label="Nhắc việc" />);
    const toggle = screen.getByRole("switch", { name: "Nhắc việc" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <div>
        <Switch label="Tắt" />
        <Switch label="Bật" defaultChecked />
        <Switch label="Vô hiệu" disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("Select", () => {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <>
        <Select
          label="Ưu tiên"
          options={priorities}
          value={value}
          onValueChange={setValue}
          placeholder="Chọn mức"
        />
        <p data-testid="value">{value}</p>
      </>
    );
  }

  it("mở danh sách và chọn một mục", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Ưu tiên" }));
    await user.click(await screen.findByRole("option", { name: "Cao" }));
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe("high"),
    );
  });

  it("lỗi đặt aria-invalid trên ô chọn", () => {
    render(
      <Select label="Ưu tiên" options={priorities} error="Hãy chọn một mức." />,
    );
    expect(
      screen
        .getByRole("combobox", { name: "Ưu tiên" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("không lỗi trợ năng", async () => {
    const { container } = render(
      <div>
        <Select label="Mặc định" options={priorities} placeholder="Chọn mức" />
        <Select label="Có lỗi" options={priorities} error="Hãy chọn một mức." />
        <Select
          label="Vô hiệu"
          options={priorities}
          defaultValue="low"
          disabled
        />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
