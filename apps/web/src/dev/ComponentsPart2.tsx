import { useState } from "react";
import { Avatar, AvatarGroup } from "../components/Avatar";
import { Badge, TaskStatusBadge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardTitle } from "../components/Card";
import { Checkbox } from "../components/Checkbox";
import { ConfirmDialog, Dialog, DialogClose } from "../components/Dialog";
import { Drawer } from "../components/Drawer";
import { EmptyState } from "../components/EmptyState";
import { DotsIcon, PlusIcon } from "../components/icons";
import { IconButton } from "../components/IconButton";
import { Input } from "../components/Input";
import { ContextMenuArea, Menu, type MenuItem } from "../components/Menu";
import { ProgressBar } from "../components/ProgressBar";
import { RadioGroup } from "../components/RadioGroup";
import { Select } from "../components/Select";
import { Skeleton, SkeletonText } from "../components/Skeleton";
import { Switch } from "../components/Switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { ToastProvider, useToast } from "../components/Toast";
import { Tooltip } from "../components/Tooltip";
import { Row, Section } from "./layout";

const priorities = [
  { value: "low", label: "Thấp" },
  { value: "normal", label: "Thường" },
  { value: "high", label: "Cao" },
  { value: "urgent", label: "Khẩn", disabled: true },
];

const people = [
  { name: "Nguyễn Văn Nam" },
  { name: "Trần Thị Hà" },
  { name: "Lê Tuấn" },
  { name: "Phạm Minh Đức" },
  { name: "Hoàng Lan" },
];

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setDirty(false);
          setOpen(true);
        }}
      >
        Mở chi tiết việc
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Chi tiết việc"
        description="Sửa tên việc rồi thử đóng: sẽ có hộp hỏi xác nhận."
        dirty={dirty}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setDirty(false);
              setOpen(false);
            }}
          >
            Lưu
          </Button>
        }
      >
        <Input
          label="Tên việc"
          defaultValue="Nghiệm thu cốt thép"
          onChange={() => setDirty(true)}
        />
      </Drawer>
    </>
  );
}

function OverlaysDemo() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const items: MenuItem[] = [
    {
      label: "Chèn việc phía dưới",
      onSelect: () => toast.show({ title: "Đã chèn việc" }),
    },
    {
      label: "Nhân bản",
      onSelect: () => toast.show({ title: "Đã nhân bản", tone: "success" }),
    },
    {
      label: "Xóa việc",
      danger: true,
      separatorBefore: true,
      onSelect: () => setConfirmOpen(true),
    },
  ];

  return (
    <>
      <Row label="Dialog, xác nhận, Drawer">
        <Dialog
          trigger={<Button>Mở hộp thoại</Button>}
          title="Giao việc"
          description="Chọn người nhận việc này."
          footer={
            <>
              <DialogClose asChild>
                <Button>Hủy</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="primary">Giao việc</Button>
              </DialogClose>
            </>
          }
        >
          <Select
            label="Người nhận"
            options={priorities}
            placeholder="Chọn người"
          />
        </Dialog>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          Xóa 5 việc
        </Button>
        <DrawerDemo />
      </Row>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xóa 5 việc?"
        description="Bạn có thể khôi phục từ thùng rác trong 30 ngày."
        confirmLabel="Xóa 5 việc"
        danger
        onConfirm={() => {
          setConfirmOpen(false);
          toast.show({
            title: "Đã xóa 5 việc",
            actionLabel: "Hoàn tác",
            onAction: () =>
              toast.show({ title: "Đã hoàn tác", tone: "success" }),
          });
        }}
      />
      <Row label="Toast (có nút hành động thì không tự đóng)">
        <Button
          onClick={() =>
            toast.show({ title: "Đã lưu thay đổi", tone: "success" })
          }
        >
          Thành công
        </Button>
        <Button
          onClick={() =>
            toast.show({
              title: "Việc sắp đến hạn",
              description: "Còn 1 ngày.",
              tone: "warning",
            })
          }
        >
          Cảnh báo
        </Button>
        <Button
          onClick={() =>
            toast.show({
              title: "Không kết nối được",
              description: "Thay đổi đã được lưu tạm.",
              tone: "danger",
            })
          }
        >
          Lỗi
        </Button>
      </Row>
      <Row label="Tooltip (rê chuột hoặc nhấn Tab)">
        <Tooltip content="Thêm việc con">
          <IconButton label="Thêm việc con" icon={<PlusIcon />} />
        </Tooltip>
      </Row>
      <Row label="Menu (nút) và menu chuột phải">
        <Menu
          trigger={<IconButton label="Thao tác" icon={<DotsIcon />} />}
          items={items}
        />
        <ContextMenuArea
          items={items}
          className="rounded-md border border-dashed border-border-strong p-16 text-sm text-text-secondary"
        >
          Nhấn chuột phải (hoặc nhấn giữ trên cảm ứng) vào vùng này
        </ContextMenuArea>
      </Row>
    </>
  );
}

export function ComponentsPart2() {
  const [priority, setPriority] = useState("normal");
  return (
    <ToastProvider>
      <Section title="Checkbox, Radio, Switch">
        <Row label="Checkbox: chưa chọn, đã chọn, nửa chọn, vô hiệu">
          <Checkbox label="Gửi thông báo" />
          <Checkbox label="Đã giao" defaultChecked />
          <Checkbox label="Chọn tất cả" checked="indeterminate" />
          <Checkbox label="Không dùng được" disabled />
        </Row>
        <RadioGroup
          label="Mức ưu tiên"
          options={priorities}
          defaultValue="normal"
        />
        <Row label="Switch: tắt, bật, vô hiệu">
          <Switch label="Nhắc việc" />
          <Switch label="Nhắc việc" defaultChecked />
          <Switch label="Nhắc việc" disabled />
        </Row>
      </Section>

      <Section title="Select">
        <Select
          label="Ưu tiên"
          options={priorities}
          value={priority}
          onValueChange={setPriority}
        />
        <Select
          label="Ưu tiên"
          options={priorities}
          placeholder="Chọn mức"
          hint="Có thể đổi sau."
          required
        />
        <Select
          label="Ưu tiên"
          options={priorities}
          placeholder="Chọn mức"
          error="Hãy chọn một mức ưu tiên."
        />
        <Select
          label="Ưu tiên"
          options={priorities}
          defaultValue="low"
          disabled
        />
        <Select
          label="Ưu tiên"
          options={priorities}
          defaultValue="low"
          loading
        />
      </Section>

      <Section
        title="Tabs"
        note="Mũi tên trái phải đổi tab, Home và End về đầu và cuối."
      >
        <Tabs defaultValue="list">
          <TabsList aria-label="Chế độ xem">
            <TabsTrigger value="list">Danh sách</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
          <TabsContent value="list">Nội dung chế độ Danh sách</TabsContent>
          <TabsContent value="kanban">Nội dung chế độ Kanban</TabsContent>
          <TabsContent value="timeline">Nội dung chế độ Timeline</TabsContent>
        </Tabs>
      </Section>

      <Section title="Dialog, Drawer, Toast, Tooltip, Menu">
        <OverlaysDemo />
      </Section>

      <Section title="Badge, Avatar, ProgressBar">
        <Row label="Trạng thái việc (luôn có biểu tượng và chữ)">
          <TaskStatusBadge status="todo" />
          <TaskStatusBadge status="doing" />
          <TaskStatusBadge status="review" />
          <TaskStatusBadge status="done" />
          <TaskStatusBadge status="blocked" />
          <TaskStatusBadge status="overdue" daysLate={2} />
        </Row>
        <Row label="Nhãn thường, nhãn có tên rất dài">
          <Badge>Pháp lý</Badge>
          <Badge className="max-w-192">
            Nhãn có tên rất dài sẽ bị cắt và hiện đầy đủ khi rê chuột
          </Badge>
        </Row>
        <Row label="Avatar 3 cỡ, nhóm avatar">
          <Avatar name="Nguyễn Văn Nam" size="sm" />
          <Avatar name="Trần Thị Hà" />
          <Avatar name="Lê Tuấn" size="lg" />
          <AvatarGroup label="Người tham gia" people={people} />
        </Row>
        <ProgressBar label="Tiến độ dự án" value={0} />
        <ProgressBar label="Tiến độ dự án" value={45} />
        <ProgressBar label="Tiến độ dự án" value={100} />
      </Section>

      <Section title="Card, EmptyState, Skeleton">
        <Card>
          <CardTitle>Giấy phép xây dựng KCN A giai đoạn 1</CardTitle>
          <p className="text-sm text-text-secondary">
            Thẻ tĩnh, không bấm được.
          </p>
        </Card>
        <Card onClick={() => undefined}>
          <CardTitle>
            Thẻ bấm được với tên rất dài để thử cắt hai dòng khi nội dung vượt
            quá chiều rộng của thẻ trên điện thoại
          </CardTitle>
          <p className="text-sm text-text-secondary">
            Cả thẻ là một nút duy nhất.
          </p>
        </Card>
        <EmptyState
          title="Hôm nay bạn chưa có việc nào"
          description="Khi có việc được giao hoặc đến hạn, việc sẽ hiện ở đây."
          action={
            <Button variant="primary" icon={<PlusIcon />}>
              Thêm việc
            </Button>
          }
        />
        <SkeletonText lines={3} />
        <Skeleton className="h-64 w-full" />
      </Section>
    </ToastProvider>
  );
}
