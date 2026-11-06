import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardTitle } from "../../components/Card";

type DashboardData = {
  period: { from: string; to: string };
  filters: {
    branches: { id: string; name: string }[];
    departments: { id: string; name: string; branchId: string | null }[];
    selectedBranchId: string | null;
    selectedDepartmentId: string | null;
  };
  projects: {
    total: number;
    health: { red: number; yellow: number; green: number };
    byBranch: {
      branchId: string;
      branchName: string;
      projects: number;
      overdueTasks: number;
    }[];
  };
  tasks: {
    byStatus: { status: string; count: number }[];
    overdue: number;
    dueSoon: number;
    onTimeCompletionRate: number;
    completedOnTime: number;
    completedWithDueDate: number;
  };
  workload: {
    departments: {
      departmentId: string;
      name: string;
      total: number;
      byStatus: Record<string, number>;
    }[];
    people: {
      userId: string;
      name: string;
      departmentId: string | null;
      total: number;
      byStatus: Record<string, number>;
    }[];
  };
  approvals: { pending: number; overdue: number };
  assignment: {
    averageResponseMinutes: number | null;
    responses: number;
    returns: number;
    returnRate: number;
    rejections: number;
    rejectionRate: number;
    extensionRequests: number;
  };
  collaboration: { comments: number; tasksWithComments: number };
  templates: { usage: { templateId: string; name: string; count: number }[] };
  system: {
    activeUsers: number;
    notificationsSent: number;
    notificationsRead: number;
    notificationReadRate: number;
  };
  projectsList: {
    id: string;
    name: string;
    status: string;
    overdueTasks: number;
  }[];
};

type ViewMode = "chart" | "table";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function ChartOrTable({
  title,
  data,
  mode,
}: {
  title: string;
  data: { label: string; value: number }[];
  mode: ViewMode;
}) {
  const max = Math.max(1, ...data.map(({ value }) => value));
  return (
    <section aria-label={title}>
      <h3 className="mb-8 font-semibold">{title}</h3>
      {mode === "chart" ? (
        <ul className="space-y-8" aria-label={`Biểu đồ: ${title}`}>
          {data.map(({ label, value }) => (
            <li key={label} className="grid grid-cols-3 items-center gap-8">
              <span>{label}</span>
              <progress
                className="h-16 w-full accent-brand-primary"
                max={max}
                value={value}
                aria-label={`${label}: ${value}`}
              />
              <strong>{value.toLocaleString("vi-VN")}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border-default p-8">
                  Nhãn
                </th>
                <th scope="col" className="border-b border-border-default p-8">
                  Số lượng
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map(({ label, value }) => (
                <tr key={label}>
                  <th
                    scope="row"
                    className="border-b border-border-default p-8 font-normal"
                  >
                    {label}
                  </th>
                  <td className="border-b border-border-default p-8">
                    {value.toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <>
      <span className="block text-sm text-text-secondary">{label}</span>
      <strong className="mt-4 block text-2xl">{value}</strong>
    </>
  );
  return href ? (
    <Link
      to={href}
      className="block rounded-md border border-border-default p-12 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand-primary"
    >
      {content}
    </Link>
  ) : (
    <div className="rounded-md border border-border-default p-12">
      {content}
    </div>
  );
}

export function DashboardPage() {
  const { apiFetch } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 29);
    return isoDate(date);
  });
  const [to, setTo] = useState(() => isoDate(today));
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set("branchId", branchId);
  if (departmentId) params.set("departmentId", departmentId);
  const query = useQuery({
    queryKey: ["dashboard", from, to, branchId, departmentId],
    queryFn: () => apiFetch<DashboardData>(`/dashboard?${params.toString()}`),
    enabled: from.length === 10 && to.length === 10 && from <= to,
  });
  const data = query.data;
  const filteredDepartments = data?.filters.departments.filter(
    (department) => !branchId || department.branchId === branchId,
  );
  const statusChart = (data?.tasks.byStatus ?? []).map(({ status, count }) => ({
    label:
      status === "todo"
        ? "Chưa làm"
        : status === "doing"
          ? "Đang làm"
          : status === "blocked"
            ? "Bị chặn"
            : "Hoàn thành",
    value: count,
  }));
  const healthChart = data
    ? [
        { label: "Đỏ · có việc quá hạn", value: data.projects.health.red },
        { label: "Vàng · sắp đến hạn", value: data.projects.health.yellow },
        {
          label: "Xanh · chưa có cảnh báo hạn",
          value: data.projects.health.green,
        },
      ]
    : [];
  const changeViewMode = () =>
    setViewMode((mode) => (mode === "chart" ? "table" : "chart"));

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-16 p-16"
    >
      <header className="flex flex-wrap items-end justify-between gap-12">
        <div>
          <h1 className="text-2xl font-bold">Dashboard và KPI</h1>
          <p className="mt-4 text-text-secondary">
            Chỉ số quản lý công việc theo phạm vi quyền của bạn.
          </p>
        </div>
        <button
          type="button"
          className="min-h-touch rounded-md border border-border-default px-12 py-8 font-medium hover:bg-surface-muted"
          onClick={changeViewMode}
          aria-label={
            viewMode === "chart"
              ? "Hiển thị dạng bảng"
              : "Hiển thị dạng biểu đồ"
          }
        >
          {viewMode === "chart" ? "Dạng bảng" : "Dạng biểu đồ"}
        </button>
      </header>

      <section
        aria-label="Bộ lọc dashboard"
        className="flex flex-wrap items-end gap-12"
      >
        <label className="grid gap-4 text-sm">
          Từ ngày
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
          />
        </label>
        <label className="grid gap-4 text-sm">
          Đến ngày
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
          />
        </label>
        {data?.filters.branches.length ? (
          <label className="grid gap-4 text-sm">
            Chi nhánh
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setDepartmentId("");
              }}
              className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
            >
              <option value="">Tất cả chi nhánh trong phạm vi</option>
              {data.filters.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {filteredDepartments?.length ? (
          <label className="grid gap-4 text-sm">
            Phòng ban
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-raised px-8"
            >
              <option value="">Tất cả phòng ban trong phạm vi</option>
              {filteredDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {query.isLoading ? <p role="status">Đang tải dashboard…</p> : null}
      {query.isError ? (
        <section
          role="alert"
          className="rounded-md border border-status-danger p-12"
        >
          <p>Không tải được dữ liệu dashboard.</p>
          <button
            type="button"
            className="mt-8 underline"
            onClick={() => void query.refetch()}
          >
            Thử lại
          </button>
        </section>
      ) : null}
      {data ? (
        <>
          <section
            aria-label="Tổng quan"
            className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Metric
              label="Dự án đang theo dõi"
              value={data.projects.total}
              href="/du-an"
            />
            <Metric
              label="Việc quá hạn"
              value={data.tasks.overdue}
              href="/viec-cua-toi?tab=overdue"
            />
            <Metric
              label="Việc sắp đến hạn (7 ngày)"
              value={data.tasks.dueSoon}
              href="/viec-cua-toi?tab=upcoming"
            />
            <Metric
              label="Phiếu chờ duyệt lâu"
              value={`${data.approvals.overdue} / ${data.approvals.pending}`}
            />
          </section>

          <div className="grid gap-16 lg:grid-cols-2">
            <Card>
              <CardTitle>Danh mục dự án</CardTitle>
              <ChartOrTable
                title="Tình trạng theo hạn công việc"
                data={healthChart}
                mode={viewMode}
              />
            </Card>
            <Card>
              <CardTitle>Phân bổ công việc</CardTitle>
              <ChartOrTable
                title="Việc theo trạng thái"
                data={statusChart}
                mode={viewMode}
              />
            </Card>
          </div>

          <Card>
            <CardTitle>Tải công việc</CardTitle>
            {data.workload.departments.length ? (
              <div className="mb-16">
                <ChartOrTable
                  title="Tổng việc đang mở theo phòng ban"
                  data={data.workload.departments.map(({ name, total }) => ({
                    label: name,
                    value: total,
                  }))}
                  mode={viewMode}
                />
              </div>
            ) : null}
            {data.workload.people.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Tải việc của từng người trong phạm vi được phép
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Người
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Chưa làm
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Đang làm
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Bị chặn
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Tổng mở
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.workload.people]
                      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
                      .map((person) => (
                        <tr key={person.userId}>
                          <th
                            scope="row"
                            className="border-b border-border-default p-8 font-normal"
                          >
                            {person.name}
                          </th>
                          <td className="border-b border-border-default p-8">
                            {person.byStatus.todo ?? 0}
                          </td>
                          <td className="border-b border-border-default p-8">
                            {person.byStatus.doing ?? 0}
                          </td>
                          <td className="border-b border-border-default p-8">
                            {person.byStatus.blocked ?? 0}
                          </td>
                          <td className="border-b border-border-default p-8">
                            {person.total}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Chưa có dữ liệu tải công việc.</p>
            )}
          </Card>

          <div className="grid gap-16 lg:grid-cols-2">
            <Card>
              <CardTitle>KPI giao việc</CardTitle>
              <dl className="grid grid-cols-2 gap-12">
                <div>
                  <dt className="text-text-secondary">Hoàn thành đúng hạn</dt>
                  <dd>
                    {(data.tasks.onTimeCompletionRate * 100).toFixed(1)}% (
                    {data.tasks.completedOnTime} /{" "}
                    {data.tasks.completedWithDueDate})
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">
                    Phản hồi nhận việc trung bình
                  </dt>
                  <dd>
                    {data.assignment.averageResponseMinutes === null
                      ? "Chưa có dữ liệu"
                      : `${Math.round(data.assignment.averageResponseMinutes)} phút`}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Tỷ lệ bị trả lại</dt>
                  <dd>
                    {(data.assignment.returnRate * 100).toFixed(1)}% (
                    {data.assignment.returns})
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Tỷ lệ từ chối</dt>
                  <dd>
                    {(data.assignment.rejectionRate * 100).toFixed(1)}% (
                    {data.assignment.rejections})
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Xin gia hạn</dt>
                  <dd>{data.assignment.extensionRequests}</dd>
                </div>
              </dl>
            </Card>
            <Card>
              <CardTitle>Cộng tác, mẫu và hệ thống</CardTitle>
              <dl className="grid grid-cols-2 gap-12">
                <div>
                  <dt className="text-text-secondary">Bình luận</dt>
                  <dd>{data.collaboration.comments}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Việc có bình luận</dt>
                  <dd>{data.collaboration.tasksWithComments}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Người dùng hoạt động</dt>
                  <dd>{data.system.activeUsers}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">Thông báo đã đọc</dt>
                  <dd>
                    {data.system.notificationsRead} /{" "}
                    {data.system.notificationsSent} (
                    {(data.system.notificationReadRate * 100).toFixed(1)}%)
                  </dd>
                </div>
              </dl>
              {data.templates.usage.length ? (
                <ul className="mt-12 list-disc pl-24">
                  {data.templates.usage.map((template) => (
                    <li key={template.templateId}>
                      {template.name}: {template.count} lượt dùng
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-12 text-text-secondary">
                  Chưa có lượt dùng mẫu trong kỳ.
                </p>
              )}
            </Card>
          </div>

          <Card>
            <CardTitle>Chi nhánh và dự án</CardTitle>
            {data.projects.byBranch.length ? (
              <div className="overflow-x-auto">
                <table className="mb-16 w-full border-collapse text-left">
                  <caption className="sr-only">So sánh chi nhánh</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Chi nhánh
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Dự án đang mở
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border-default p-8"
                      >
                        Việc quá hạn
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.byBranch.map((branch) => (
                      <tr key={branch.branchId}>
                        <th
                          scope="row"
                          className="border-b border-border-default p-8 font-normal"
                        >
                          {branch.branchName}
                        </th>
                        <td className="border-b border-border-default p-8">
                          {branch.projects}
                        </td>
                        <td className="border-b border-border-default p-8">
                          {branch.overdueTasks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {data.projectsList.length ? (
              <ul className="space-y-8">
                {data.projectsList
                  .filter(
                    (project) =>
                      project.status !== "completed" &&
                      project.status !== "archived",
                  )
                  .map((project) => (
                    <li
                      key={project.id}
                      className="flex flex-wrap items-center justify-between gap-8"
                    >
                      <Link
                        className="text-brand-primary underline"
                        to={`/du-an/${project.id}`}
                      >
                        {project.name}
                      </Link>
                      <span>
                        {project.overdueTasks > 0
                          ? `Đỏ · ${project.overdueTasks} việc quá hạn`
                          : project.status}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>Không có dự án trong phạm vi dashboard.</p>
            )}
          </Card>
        </>
      ) : null}
    </main>
  );
}
