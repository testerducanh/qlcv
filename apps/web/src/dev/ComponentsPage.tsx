import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { PlusIcon } from "../components/icons";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { cx } from "../lib/cx";
import { ComponentsPart3 } from "./ComponentsPart3";

const variants: Array<[ButtonVariant, string]> = [
  ["primary", "Nút chính"],
  ["secondary", "Nút phụ"],
  ["ghost", "Nút chữ"],
  ["danger", "Xóa việc"],
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-12 border-b border-border-default pb-24">
      <h2 className="text-xl font-bold">{title}</h2>
      {note ? <p className="text-sm text-text-secondary">{note}</p> : null}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-12">{children}</div>
    </div>
  );
}

export default function ComponentsPage() {
  const [narrow, setNarrow] = useState(false);

  return (
    <main
      className={cx(
        "mx-auto flex w-full flex-col gap-24 p-16",
        narrow && "max-w-phone",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-12">
        <h1 className="text-2xl font-bold">Thư viện component</h1>
        <Button onClick={() => setNarrow((v) => !v)} aria-pressed={narrow}>
          {narrow ? "Xem bề rộng đầy đủ" : "Xem bề rộng điện thoại"}
        </Button>
      </header>
      <p className="text-sm text-text-secondary">
        Trạng thái hover và active: rê chuột và nhấn giữ. Trạng thái
        focus-visible: dùng phím Tab.
      </p>

      <Section title="Button">
        {variants.map(([variant, text]) => (
          <div key={variant} className="flex flex-col gap-12">
            <Row label={`${variant}: mặc định, có biểu tượng`}>
              <Button variant={variant}>{text}</Button>
              <Button variant={variant} icon={<PlusIcon />}>
                Thêm việc con
              </Button>
            </Row>
            <Row label={`${variant}: vô hiệu, đang tải`}>
              <Button variant={variant} disabled>
                {text}
              </Button>
              <Button variant={variant} loading loadingText="Đang lưu">
                Lưu thay đổi
              </Button>
            </Row>
          </div>
        ))}
        <Row label="Nhãn dài (xuống dòng, không cắt chữ)">
          <Button variant="primary" className="max-w-full">
            Giao việc cho toàn bộ nhóm Kỹ thuật chi nhánh miền Bắc và gửi thông
            báo
          </Button>
        </Row>
      </Section>

      <Section
        title="IconButton"
        note="Chỉ có biểu tượng, bắt buộc có tên truy cập."
      >
        <Row label="mặc định, vô hiệu, đang tải">
          <IconButton label="Thêm việc" icon={<PlusIcon />} />
          <IconButton label="Thêm việc" icon={<PlusIcon />} disabled />
          <IconButton label="Đang thêm việc" icon={<PlusIcon />} loading />
        </Row>
      </Section>

      <Section title="Input">
        <Input
          label="Tên việc"
          placeholder="Ví dụ: Nghiệm thu cốt thép"
          hint="Gõ ngắn gọn, dưới 80 ký tự."
        />
        <Input label="Tên dự án" required />
        <Input
          label="Tên việc"
          defaultValue=""
          error="Tên việc không được để trống."
        />
        <Input label="Mã việc" defaultValue="CV-0001" disabled />
        <Input
          label="Kiểm tra trùng tên"
          defaultValue="Đổ bê tông móng M1"
          loading
        />
        <Input
          label="Tên rất dài"
          defaultValue="Nghiệm thu khối lượng đắp nền khu B3 giai đoạn hai kèm biên bản và ảnh hiện trường đầy đủ"
        />
      </Section>

      <Section title="Textarea">
        <Textarea label="Mô tả" hint="Tự giãn đến tối đa 8 dòng rồi cuộn." />
        <Textarea
          label="Ghi chú"
          error="Ghi chú quá dài."
          defaultValue="Nội dung ghi chú"
        />
        <Textarea
          label="Ghi chú (vô hiệu)"
          disabled
          defaultValue="Không sửa được"
        />
      </Section>
      <ComponentsPart3 />
    </main>
  );
}
