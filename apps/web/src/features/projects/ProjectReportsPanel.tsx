import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { Card, CardTitle } from "../../components/Card";

type ExportFormat = "csv" | "xlsx" | "json";
type ReportScope = "project" | "visible" | "fortnight" | "month" | "custom";

interface ReportTask {
  id: string;
  parentId: string | null;
  depth: number;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  durationDays: number | null;
  dueDate: string | null;
  progress: number;
  assignee: { id: string; name: string; email: string } | null;
  labels: Array<{ id: string; name: string; color: string }>;
  checklist: Array<{ title: string; done: boolean }>;
  predecessors: Array<{ title: string; type: string; lagDays: number }>;
  successors: Array<{ title: string; type: string; lagDays: number }>;
}

interface ReportData {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    startDate: string | null;
    dueDate: string | null;
    confidentiality: string;
    branch: string;
    progressMode: string;
  };
  labels: Array<{ id: string; name: string; color: string }>;
  tasks: ReportTask[];
  exportedAt: string;
}

interface Baseline {
  id: string;
  name: string;
  createdAt: string;
  taskCount: number;
  changedCount: number;
  changes: Array<{
    taskId: string;
    title: string;
    removed: boolean;
    baselineStartDate?: string | null;
    currentStartDate?: string | null;
    baselineDueDate?: string | null;
    currentDueDate?: string | null;
  }>;
}

interface ApprovalFlow {
  id: string;
  name: string;
  requestType: string;
  enabled: boolean;
}

interface ApprovalRequest {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
}

const columns = [
  ["title", "Tên việc"],
  ["assignee", "Người phụ trách"],
  ["startDate", "Bắt đầu"],
  ["dueDate", "Kết thúc"],
  ["durationDays", "Thời lượng"],
  ["status", "Trạng thái"],
  ["progress", "Tiến độ"],
  ["priority", "Ưu tiên"],
  ["labels", "Nhãn"],
  ["description", "Ghi chú"],
  ["checklist", "Checklist"],
  ["predecessors", "Phụ thuộc trước"],
] as const;

function csvValue(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function download(filename: string, type: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function rowFor(task: ReportTask) {
  return {
    title: `${"  ".repeat(task.depth)}${task.title}`,
    assignee: task.assignee?.name ?? "",
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    status: task.status,
    progress: `${task.progress}%`,
    labels: task.labels.map((label) => label.name).join(", "),
    description: task.description ?? "",
    durationDays: task.durationDays ?? "",
    priority: task.priority,
    checklist: task.checklist
      .map((item) => `${item.done ? "[x]" : "[ ]"} ${item.title}`)
      .join("; "),
    predecessors: task.predecessors
      .map((item) => `${item.title} (${item.type}, ${item.lagDays})`)
      .join("; "),
  };
}

export function ProjectReportsPanel({
  projectId,
  canManage,
  canExport,
  isRestricted,
}: {
  projectId: string;
  canManage: boolean;
  canExport: boolean;
  isRestricted: boolean;
}) {
  const { apiFetch } = useAuth();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    columns.map(([key]) => key),
  );
  const [baselineName, setBaselineName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [preview, setPreview] = useState<ReportData | null>(null);
  const [scope, setScope] = useState<ReportScope>("project");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [paper, setPaper] = useState<"A3" | "A4">("A3");
  const [groupsOnly, setGroupsOnly] = useState(false);
  const [projectCode, setProjectCode] = useState("");
  const [signatureNames, setSignatureNames] = useState([
    "Đại diện chủ đầu tư",
    "Tư vấn giám sát",
    "Đơn vị thi công",
  ]);
  const [logo, setLogo] = useState("");

  const baselineQuery = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () =>
      apiFetch<Baseline[]>(`/projects/${projectId}/reports/baselines`),
  });
  const baselineMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/reports/baselines`, {
        method: "POST",
        body: JSON.stringify({ name: baselineName.trim() }),
      }),
    onSuccess: async () => {
      setBaselineName("");
      setFeedback("Đã lưu baseline kế hoạch.");
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "baselines"],
      });
    },
    onError: (error: Error) => setFeedback(error.message),
  });
  const approvalFlowsQuery = useQuery({
    queryKey: ["projects", projectId, "approval-flows"],
    queryFn: () =>
      apiFetch<ApprovalFlow[]>(`/projects/${projectId}/approval-flows`),
    enabled: isRestricted,
  });
  const approvalRequestsQuery = useQuery({
    queryKey: ["projects", projectId, "approval-requests"],
    queryFn: () =>
      apiFetch<ApprovalRequest[]>(`/projects/${projectId}/approval-requests`),
    enabled: isRestricted,
  });
  const confidentialExportRequest = approvalRequestsQuery.data?.find(
    (request) =>
      request.subjectType === "project" &&
      request.subjectId === projectId &&
      ["pending", "approved"].includes(request.status),
  );
  const confidentialExportFlow = approvalFlowsQuery.data?.find(
    (flow) => flow.requestType === "confidential_export" && flow.enabled,
  );
  const requestExportApproval = useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          flowId: confidentialExportFlow?.id,
          subjectType: "project",
          subjectId: projectId,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Đã gửi yêu cầu xuất dự án mật để phê duyệt.");
      await queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "approval-requests"],
      });
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const scopeDates = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (scope === "fortnight") {
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() + 14);
      return { from: today, to: end.toISOString().slice(0, 10) };
    }
    if (scope === "month") {
      const end = new Date(now);
      end.setUTCMonth(end.getUTCMonth() + 1);
      return { from: today, to: end.toISOString().slice(0, 10) };
    }
    if (scope === "custom") return { from: rangeStart, to: rangeEnd };
    return null;
  }, [rangeEnd, rangeStart, scope]);

  const tasks = useMemo(() => {
    if (!preview) return [];
    return preview.tasks.filter((task) => {
      if (groupsOnly && task.type !== "group") return false;
      if (scope === "visible" && !task.startDate && !task.dueDate) return false;
      if (scopeDates) {
        const start = task.startDate ?? task.dueDate;
        const end = task.dueDate ?? task.startDate;
        return Boolean(
          start &&
          end &&
          (!scopeDates.from || end >= scopeDates.from) &&
          (!scopeDates.to || start <= scopeDates.to),
        );
      }
      return true;
    });
  }, [groupsOnly, preview, scope, scopeDates]);

  const loadReport = async (targetFormat: "csv" | "xlsx" | "json" | "pdf") =>
    apiFetch<ReportData>(
      `/projects/${projectId}/reports/export-data?format=${targetFormat}`,
    );

  const exportReport = async () => {
    setFeedback("");
    try {
      const data = await loadReport(format);
      const rows = data.tasks.map(rowFor);
      if (format === "json") {
        download(
          `${data.project.name}.json`,
          "application/json;charset=utf-8",
          JSON.stringify(data, null, 2),
        );
      } else if (format === "csv") {
        const outputColumns = columns.filter(([key]) =>
          selectedColumns.includes(key),
        );
        const header = outputColumns.map(([, label]) => csvValue(label));
        const body = rows.map((row) =>
          outputColumns.map(([key]) => csvValue(row[key])).join(","),
        );
        download(
          `${data.project.name}.csv`,
          "text/csv;charset=utf-8",
          `\uFEFF${[header.join(","), ...body].join("\r\n")}`,
        );
      } else {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Tiến độ");
        sheet.addRow(["Dự án", data.project.name]);
        sheet.addRow(["Mã dự án", projectCode]);
        sheet.addRow(["Ngày cập nhật", new Date(data.exportedAt)]);
        sheet.addRow([]);
        const outputColumns = columns.filter(([key]) =>
          selectedColumns.includes(key),
        );
        sheet.addRow(outputColumns.map(([, label]) => label));
        for (const row of rows) {
          sheet.addRow(
            outputColumns.map(([key]) => {
              const value = row[key];
              return typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(value)
                ? `'${value}`
                : value;
            }),
          );
        }
        sheet.views = [{ state: "frozen", ySplit: 5 }];
        sheet.columns.forEach((column) => {
          column.width = 22;
        });
        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(buffer)], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${data.project.name}.xlsx`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setFeedback(`Đã tạo tệp ${format.toUpperCase()} và ghi nhật ký xuất.`);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Không xuất được báo cáo",
      );
    }
  };

  const openPrintPreview = async () => {
    setFeedback("");
    try {
      setPreview(await loadReport("pdf"));
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Không tải được dữ liệu in",
      );
    }
  };

  return (
    <Card>
      <CardTitle as="h2">Baseline, in và xuất báo cáo</CardTitle>
      {canManage ? (
        <form
          className="mt-12 flex flex-wrap items-end gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            baselineMutation.mutate();
          }}
        >
          <label className="flex min-w-56 flex-col gap-4 text-sm font-medium">
            Tên baseline
            <input
              required
              maxLength={120}
              value={baselineName}
              onChange={(event) => setBaselineName(event.currentTarget.value)}
              className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            loading={baselineMutation.isPending}
          >
            Lưu baseline
          </Button>
        </form>
      ) : null}
      {baselineQuery.isError ? (
        <p role="alert" className="mt-8">
          {baselineQuery.error.message}
        </p>
      ) : null}
      {baselineQuery.data?.map((baseline) => (
        <details
          key={baseline.id}
          className="mt-8 rounded border border-border-default p-8"
        >
          <summary className="cursor-pointer">
            {baseline.name} · {baseline.changedCount} thay đổi trên{" "}
            {baseline.taskCount} việc
          </summary>
          <ul className="mt-8 list-disc pl-24 text-sm">
            {baseline.changes.map((change) => (
              <li key={change.taskId}>
                {change.title}
                {change.removed
                  ? " · đã xóa sau baseline"
                  : ` · bắt đầu ${change.baselineStartDate ?? "—"} → ${change.currentStartDate ?? "—"}; kết thúc ${change.baselineDueDate ?? "—"} → ${change.currentDueDate ?? "—"}`}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {isRestricted ? (
        <div className="mt-12 rounded-md border border-border-default p-12">
          <h3 className="font-semibold">Dự án mật: phê duyệt xuất dữ liệu</h3>
          {approvalFlowsQuery.isError || approvalRequestsQuery.isError ? (
            <p role="alert" className="mt-8">
              Không tải được trạng thái phê duyệt.
            </p>
          ) : confidentialExportRequest?.status === "approved" ? (
            <p className="mt-8 text-sm">Yêu cầu xuất gần nhất đã được duyệt.</p>
          ) : confidentialExportRequest?.status === "pending" ? (
            <p className="mt-8 text-sm">Yêu cầu xuất đang chờ phê duyệt.</p>
          ) : confidentialExportFlow ? (
            <Button
              className="mt-8"
              disabled={requestExportApproval.isPending}
              loading={requestExportApproval.isPending}
              onClick={() => requestExportApproval.mutate()}
            >
              Yêu cầu duyệt xuất dữ liệu
            </Button>
          ) : (
            <p className="mt-8 text-sm">
              Chưa cấu hình luồng phê duyệt confidential_export cho dự án.
            </p>
          )}
        </div>
      ) : null}
      {canExport ? (
        <>
          <div className="mt-16 grid gap-12 md:grid-cols-2">
            <label className="flex flex-col gap-4 text-sm font-medium">
              Định dạng tải xuống
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.currentTarget.value as ExportFormat)
                }
                className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
                <option value="json">JSON sao lưu</option>
              </select>
            </label>
            <label className="flex flex-col gap-4 text-sm font-medium">
              Mã dự án trên báo cáo
              <input
                value={projectCode}
                onChange={(event) => setProjectCode(event.currentTarget.value)}
                className="min-h-touch rounded-md border border-border-default bg-surface-base px-8"
              />
            </label>
          </div>
          {format !== "json" ? (
            <fieldset className="mt-12">
              <legend className="text-sm font-medium">Cột xuất</legend>
              <div className="mt-8 flex flex-wrap gap-12">
                {columns.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-4 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(key)}
                      onChange={(event) =>
                        setSelectedColumns((current) =>
                          event.currentTarget.checked
                            ? [...current, key]
                            : current.filter((value) => value !== key),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="mt-12 flex flex-wrap gap-8">
            <Button variant="primary" onClick={() => void exportReport()}>
              Tải {format.toUpperCase()}
            </Button>
            <Button onClick={() => void openPrintPreview()}>
              Xem trước bản in
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-12 text-sm text-text-secondary">
          Bạn chưa được cấp quyền xuất dữ liệu dự án.
        </p>
      )}
      {feedback ? (
        <p className="mt-8 text-sm" role="status">
          {feedback}
        </p>
      ) : null}
      {preview ? (
        <section className="mt-16">
          <div className="report-toolbar rounded-md border border-border-default p-12">
            <h3 className="font-semibold">Tùy chọn in</h3>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              <label className="flex flex-col gap-4 text-sm">
                Khổ giấy
                <select
                  value={paper}
                  onChange={(event) =>
                    setPaper(event.currentTarget.value as "A3" | "A4")
                  }
                  className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                >
                  <option value="A3">A3 ngang</option>
                  <option value="A4">A4 ngang</option>
                </select>
              </label>
              <label className="flex flex-col gap-4 text-sm">
                Phạm vi
                <select
                  value={scope}
                  onChange={(event) =>
                    setScope(event.currentTarget.value as ReportScope)
                  }
                  className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                >
                  <option value="project">Cả dự án</option>
                  <option value="visible">Việc có lịch</option>
                  <option value="fortnight">2 tuần tới</option>
                  <option value="month">1 tháng tới</option>
                  <option value="custom">Tùy chọn</option>
                </select>
              </label>
              <label className="flex flex-col justify-end gap-4 text-sm">
                <span>Mức chi tiết</span>
                <span className="flex min-h-touch items-center gap-8">
                  <input
                    type="checkbox"
                    checked={groupsOnly}
                    onChange={(event) =>
                      setGroupsOnly(event.currentTarget.checked)
                    }
                  />
                  Chỉ nhóm việc
                </span>
              </label>
            </div>
            {scope === "custom" ? (
              <div className="mt-8 flex flex-wrap gap-8">
                <label className="flex flex-col gap-4 text-sm">
                  Từ ngày
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(event) =>
                      setRangeStart(event.currentTarget.value)
                    }
                    className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                  />
                </label>
                <label className="flex flex-col gap-4 text-sm">
                  Đến ngày
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.currentTarget.value)}
                    className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                  />
                </label>
              </div>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-8">
              {signatureNames.map((name, index) => (
                <label key={index} className="flex flex-col gap-4 text-sm">
                  Chữ ký {index + 1}
                  <input
                    value={name}
                    onChange={(event) =>
                      setSignatureNames((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? event.currentTarget.value
                            : item,
                        ),
                      )
                    }
                    className="min-h-touch rounded border border-border-default bg-surface-base px-8"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-4 text-sm">
                Logo (ảnh cục bộ)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFeedback("Logo không được vượt quá 2 MB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setLogo(String(reader.result ?? ""));
                    reader.onerror = () => setFeedback("Không đọc được logo.");
                    reader.readAsDataURL(file);
                  }}
                  className="min-h-touch max-w-56 rounded border border-border-default bg-surface-base px-8"
                />
              </label>
            </div>
            <Button
              className="mt-12"
              variant="primary"
              onClick={() => window.print()}
            >
              In / Lưu PDF
            </Button>
            <p className="mt-8 text-xs text-text-secondary">
              Trình duyệt mở hộp thoại in để lưu PDF. Bản in được tạo tại thiết
              bị, không qua hàng đợi máy chủ.
            </p>
          </div>
          <article className={`report-print report-${paper.toLowerCase()}`}>
            <style>{`@page { size: ${paper} landscape; margin: 12mm; }`}</style>
            <header className="report-header">
              {logo ? (
                <img src={logo} alt="Logo dự án" className="report-logo" />
              ) : null}
              <div>
                <p>
                  {projectCode || "Mã dự án: —"} · {preview.project.branch}
                </p>
                <h1>{preview.project.name}</h1>
                <p>
                  Khởi công: {preview.project.startDate ?? "—"} · Bàn giao:{" "}
                  {preview.project.dueDate ?? "—"} · Tiến độ:{" "}
                  {tasks.length
                    ? Math.round(
                        tasks.reduce((sum, task) => sum + task.progress, 0) /
                          tasks.length,
                      )
                    : 0}
                  %
                </p>
                <p>
                  Cập nhật:{" "}
                  {new Date(preview.exportedAt).toLocaleString("vi-VN")}
                </p>
              </div>
            </header>
            <p className="report-legend">
              Chú giải trạng thái: todo — Chưa làm · doing — Đang làm · done —
              Hoàn thành · blocked — Bị chặn
            </p>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Việc</th>
                  <th>Người phụ trách</th>
                  <th>Bắt đầu</th>
                  <th>Kết thúc</th>
                  <th>Tiến độ</th>
                  <th>Nhãn</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td
                      style={{ paddingInlineStart: `${8 + task.depth * 5}mm` }}
                    >
                      {task.title}
                    </td>
                    <td>{task.assignee?.name ?? "—"}</td>
                    <td>{task.startDate ?? "—"}</td>
                    <td>{task.dueDate ?? "—"}</td>
                    <td>{task.progress}%</td>
                    <td>
                      {task.labels.map((label) => label.name).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="report-signatures">
              {signatureNames.map((name, index) => (
                <section key={index}>
                  <strong>{name || `Bên ký ${index + 1}`}</strong>
                  <div />
                  <span>(Ký, ghi rõ họ tên)</span>
                </section>
              ))}
            </footer>
            <p className="report-page-number">Trang </p>
          </article>
        </section>
      ) : null}
    </Card>
  );
}
